//! The tunnel openconnect hands over with --script-tun: one IP packet per message, both ways.
//! Linux and macOS: a datagram socket, its fd in VPNFD. Windows: a message-mode named pipe, its name in VPNPIPE
//! (packaging/vpn/openconnect-windows-script-tun.patch).

use std::io;

pub trait Link: Send + Sync {
    /// The next packet into buf; Ok(0): the tunnel is gone.
    fn recv(&self, buf: &mut [u8]) -> io::Result<usize>;
    fn send(&self, packet: &[u8]) -> io::Result<()>;
}

#[cfg(unix)]
pub use unix::Datagram;

#[cfg(unix)]
mod unix {
    use std::io;
    use std::os::fd::{AsRawFd, FromRawFd, RawFd};
    use std::os::unix::net::UnixDatagram;
    use std::time::{Duration, Instant};

    pub struct Datagram(UnixDatagram);

    /// Room asked for in each direction: macOS gives a datagram socket 4 KB (about three packets), so a fast
    /// transfer lost most of its packets there (Linux's default is far larger).
    const ROOM: libc::c_int = 1 << 20;
    /// How long a packet waits for openconnect to make room before it is dropped.
    const FULL_WAIT: Duration = Duration::from_millis(20);
    /// The longest a recv waits. macOS doesn't wake a waiting recv when openconnect's end closes (the next one
    /// says ECONNRESET), so without it the tunnel stayed after the VPN was gone, holding its port.
    const RECV_WAIT: Duration = Duration::from_secs(1);

    impl Datagram {
        pub fn new(socket: UnixDatagram) -> Datagram {
            for option in [libc::SO_SNDBUF, libc::SO_RCVBUF] {
                // SAFETY: a socket this Datagram owns, and an int that lives for the call. If the system refuses,
                // its own size stays (the tunnel works, only slower).
                unsafe {
                    libc::setsockopt(socket.as_raw_fd(), libc::SOL_SOCKET, option,
                                     (&ROOM as *const libc::c_int).cast(),
                                     size_of::<libc::c_int>() as libc::socklen_t);
                }
            }
            let _ = socket.set_read_timeout(Some(RECV_WAIT));
            Datagram(socket)
        }

        /// VPNFD: the fd openconnect left open for its script.
        pub fn from_fd(fd: RawFd) -> io::Result<Datagram> {
            if fd < 3 {
                return Err(io::Error::new(io::ErrorKind::InvalidInput, "VPNFD is not a socket"));
            }
            // SAFETY: openconnect passes this fd to its script for exactly this; nothing else here owns it.
            Ok(Datagram::new(unsafe { UnixDatagram::from_raw_fd(fd) }))
        }
    }

    /// openconnect's side is full for a moment. Linux says EAGAIN (or blocks); macOS says ENOBUFS at once,
    /// even on a blocking socket.
    fn full(e: &io::Error) -> bool {
        e.kind() == io::ErrorKind::WouldBlock || e.raw_os_error() == Some(libc::ENOBUFS)
    }

    impl super::Link for Datagram {
        fn recv(&self, buf: &mut [u8]) -> io::Result<usize> {
            loop {
                let start = Instant::now();
                match self.0.recv(buf) {
                    Err(e) if e.kind() == io::ErrorKind::Interrupted => continue,
                    // RECV_WAIT passed: wait again (at once back: a non-blocking fd, so not in a tight loop)
                    Err(e) if matches!(e.kind(), io::ErrorKind::WouldBlock | io::ErrorKind::TimedOut) => {
                        if start.elapsed() < RECV_WAIT / 2 {
                            std::thread::sleep(Duration::from_millis(10));
                        }
                    }
                    other => return other,
                }
            }
        }

        fn send(&self, packet: &[u8]) -> io::Result<()> {
            let start = Instant::now();
            loop {
                match self.0.send(packet) {
                    Err(e) if e.kind() == io::ErrorKind::Interrupted => continue,
                    // wait a moment for openconnect to read; still full: drop it, as a network would (TCP sends
                    // it again)
                    Err(e) if full(&e) => {
                        if start.elapsed() >= FULL_WAIT {
                            return Ok(());
                        }
                        std::thread::sleep(Duration::from_micros(200));
                    }
                    other => return other.map(|_| ()),
                }
            }
        }
    }
}

#[cfg(windows)]
pub use windows::Pipe;

#[cfg(windows)]
mod windows {
    use std::io;
    use std::ptr;

    use windows_sys::Win32::Foundation::{
        CloseHandle, ERROR_BROKEN_PIPE, ERROR_IO_PENDING, ERROR_MORE_DATA, ERROR_NO_DATA, ERROR_PIPE_NOT_CONNECTED,
        GENERIC_READ, GENERIC_WRITE, GetLastError, HANDLE, INVALID_HANDLE_VALUE,
    };
    use windows_sys::Win32::Storage::FileSystem::{
        CreateFileW, FILE_FLAG_OVERLAPPED, OPEN_EXISTING, ReadFile, WriteFile,
    };
    use windows_sys::Win32::System::IO::{GetOverlappedResult, OVERLAPPED};
    use windows_sys::Win32::System::Pipes::{PIPE_READMODE_MESSAGE, SetNamedPipeHandleState};
    use windows_sys::Win32::System::Threading::CreateEventW;

    /// The pipe, opened for overlapped I/O: a read can wait while a write goes out (with plain I/O, Windows
    /// would hold the write until the read is done).
    pub struct Pipe(HANDLE);

    // SAFETY: a pipe handle may be used from any thread; each call brings its own OVERLAPPED and event.
    unsafe impl Send for Pipe {}
    unsafe impl Sync for Pipe {}

    impl Pipe {
        pub fn open(name: &str) -> io::Result<Pipe> {
            if !name.starts_with(r"\\.\pipe\") {
                return Err(io::Error::new(io::ErrorKind::InvalidInput, "VPNPIPE is not a pipe name"));
            }
            let wide: Vec<u16> = name.encode_utf16().chain(Some(0)).collect();
            // SAFETY: wide is a NUL-terminated name; the other arguments are plain values.
            let handle = unsafe {
                CreateFileW(wide.as_ptr(), GENERIC_READ | GENERIC_WRITE, 0, ptr::null(), OPEN_EXISTING,
                            FILE_FLAG_OVERLAPPED, ptr::null_mut())
            };
            if handle == INVALID_HANDLE_VALUE {
                return Err(io::Error::last_os_error());
            }
            let pipe = Pipe(handle);
            let mode = PIPE_READMODE_MESSAGE;
            // SAFETY: handle is the pipe just opened; mode lives for the call.
            if unsafe { SetNamedPipeHandleState(handle, &mode, ptr::null(), ptr::null()) } == 0 {
                return Err(io::Error::last_os_error());
            }
            Ok(pipe)
        }

        /// One overlapped read or write, waited for.
        fn io(&self, read: bool, buf: *mut u8, len: usize) -> io::Result<usize> {
            // SAFETY: a fresh manual-reset event, closed below.
            let event = unsafe { CreateEventW(ptr::null(), 1, 0, ptr::null()) };
            if event.is_null() {
                return Err(io::Error::last_os_error());
            }
            // SAFETY: OVERLAPPED is plain data; zero is its starting state.
            let mut ov: OVERLAPPED = unsafe { std::mem::zeroed() };
            ov.hEvent = event;
            let mut done = 0u32;
            let len = len.min(u32::MAX as usize) as u32;
            // SAFETY: buf is valid for len bytes until GetOverlappedResult (which waits) returns.
            let ok = unsafe {
                if read {
                    ReadFile(self.0, buf, len, &mut done, &mut ov)
                } else {
                    WriteFile(self.0, buf, len, &mut done, &mut ov)
                }
            };
            let mut result = if ok != 0 { Ok(done as usize) } else { Err(unsafe { GetLastError() }) };
            if result == Err(ERROR_IO_PENDING) {
                // SAFETY: waits for the operation started above, on the same OVERLAPPED.
                result = if unsafe { GetOverlappedResult(self.0, &ov, &mut done, 1) } != 0 {
                    Ok(done as usize)
                } else {
                    Err(unsafe { GetLastError() })
                };
            }
            // SAFETY: the event made above; the operation is finished.
            unsafe { CloseHandle(event) };
            match result {
                Ok(n) => Ok(n),
                Err(e) if e == ERROR_BROKEN_PIPE || e == ERROR_PIPE_NOT_CONNECTED || e == ERROR_NO_DATA => Ok(0),
                // a packet bigger than buf: it can't be one of ours (the MTU is smaller), so it's dropped
                Err(e) if e == ERROR_MORE_DATA => Err(io::Error::new(io::ErrorKind::InvalidData, "packet too big")),
                Err(e) => Err(io::Error::from_raw_os_error(e as i32)),
            }
        }
    }

    impl super::Link for Pipe {
        fn recv(&self, buf: &mut [u8]) -> io::Result<usize> {
            loop {
                match self.io(true, buf.as_mut_ptr(), buf.len()) {
                    Err(e) if e.kind() == io::ErrorKind::InvalidData => continue,
                    other => return other,
                }
            }
        }

        fn send(&self, packet: &[u8]) -> io::Result<()> {
            match self.io(false, packet.as_ptr() as *mut u8, packet.len())? {
                0 if !packet.is_empty() => Err(io::Error::new(io::ErrorKind::BrokenPipe, "the tunnel closed")),
                _ => Ok(()),
            }
        }
    }

    impl Drop for Pipe {
        fn drop(&mut self) {
            // SAFETY: the handle this Pipe owns.
            unsafe { CloseHandle(self.0) };
        }
    }
}
