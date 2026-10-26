//! `serve` on macOS (and Linux, for tests): a Unix socket anyone may open; the peer's uid decides.

use std::fs;
use std::os::fd::AsRawFd;
use std::os::unix::fs::{FileTypeExt, PermissionsExt};
use std::os::unix::net::{UnixListener, UnixStream};
use std::path::{Path, PathBuf};
use std::sync::Arc;
use std::thread;
use std::time::Duration;

use crate::server::Server;

pub fn serve(server: Arc<Server>, socket: &Path) -> Result<(), String> {
    stop_on_signal(server.clone(), socket.to_path_buf());
    match fs::symlink_metadata(socket) {
        Ok(m) if m.file_type().is_socket() => {
            fs::remove_file(socket).map_err(|e| format!("Can't remove the old {}: {e}", socket.display()))?
        }
        Ok(_) => return Err(format!("{} exists and is not a socket", socket.display())),
        Err(_) => {}
    }
    let listener = UnixListener::bind(socket).map_err(|e| format!("Can't listen on {}: {e}", socket.display()))?;
    fs::set_permissions(socket, fs::Permissions::from_mode(0o666)).map_err(|e| format!("Can't chmod the socket: {e}"))?;
    for conn in listener.incoming() {
        match conn {
            Ok(stream) => {
                let server = server.clone();
                thread::spawn(move || {
                    let _ = stream.set_read_timeout(Some(Duration::from_secs(10)));
                    let _ = stream.set_write_timeout(Some(Duration::from_secs(10)));
                    let caller = peer_uid(&stream).map(|u| u.to_string());
                    server.answer(caller.as_deref(), &stream);
                });
            }
            Err(e) => eprintln!("hpc-hub-vpn-helper: accept failed: {e}"),
        }
    }
    Ok(())
}

/// SIGTERM (launchd stopping us), SIGINT or SIGHUP: take the tunnel down first, so openconnect cleans up.
/// Call before any thread starts: the signals are blocked in every thread and taken by one with sigwait.
fn stop_on_signal(server: Arc<Server>, socket: PathBuf) {
    let mut set: libc::sigset_t = unsafe { std::mem::zeroed() };
    unsafe {
        libc::sigemptyset(&mut set);
        for sig in [libc::SIGTERM, libc::SIGINT, libc::SIGHUP] {
            libc::sigaddset(&mut set, sig);
        }
        libc::pthread_sigmask(libc::SIG_BLOCK, &set, std::ptr::null_mut());
    }
    thread::spawn(move || {
        let mut sig = 0;
        unsafe { libc::sigwait(&set, &mut sig) };
        server.tunnel.down();
        let _ = fs::remove_file(&socket);
        std::process::exit(0);
    });
}

#[cfg(any(target_os = "linux", target_os = "android"))]
fn peer_uid(stream: &UnixStream) -> Option<u32> {
    let mut cred: libc::ucred = unsafe { std::mem::zeroed() };
    let mut len = std::mem::size_of::<libc::ucred>() as libc::socklen_t;
    let rc = unsafe {
        libc::getsockopt(
            stream.as_raw_fd(),
            libc::SOL_SOCKET,
            libc::SO_PEERCRED,
            (&raw mut cred).cast(),
            &mut len,
        )
    };
    (rc == 0 && len as usize == std::mem::size_of::<libc::ucred>()).then_some(cred.uid)
}

#[cfg(not(any(target_os = "linux", target_os = "android")))]
fn peer_uid(stream: &UnixStream) -> Option<u32> {
    let (mut uid, mut gid): (libc::uid_t, libc::gid_t) = (0, 0);
    let rc = unsafe { libc::getpeereid(stream.as_raw_fd(), &mut uid, &mut gid) };
    (rc == 0).then_some(uid)
}
