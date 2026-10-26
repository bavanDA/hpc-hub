//! `serve` on Windows: a named pipe only SYSTEM, Administrators and the configured users may open, and a check
//! of the client's SID. Runs as the HpcHubVpn service when the SCM starts it, in the foreground from a console.

use std::ffi::OsString;
use std::fs::File;
use std::os::windows::io::{AsRawHandle, FromRawHandle};
use std::ptr::null_mut;
use std::sync::mpsc;
use std::sync::{Arc, OnceLock};
use std::thread;
use std::time::Duration;

use windows_service::service::{
    ServiceControl, ServiceControlAccept, ServiceExitCode, ServiceState, ServiceStatus, ServiceType,
};
use windows_service::service_control_handler::{self, ServiceControlHandlerResult};
use windows_service::{define_windows_service, service_dispatcher};
use windows_sys::Win32::Foundation::{
    CloseHandle, ERROR_FAILED_SERVICE_CONTROLLER_CONNECT, ERROR_PIPE_CONNECTED, GetLastError, HANDLE,
    INVALID_HANDLE_VALUE, LocalFree,
};
use windows_sys::Win32::Security::Authorization::{
    ConvertSidToStringSidW, ConvertStringSecurityDescriptorToSecurityDescriptorW, SDDL_REVISION_1,
};
use windows_sys::Win32::Security::{
    GetTokenInformation, PSECURITY_DESCRIPTOR, SECURITY_ATTRIBUTES, TOKEN_ELEVATION, TOKEN_QUERY, TOKEN_USER,
    TokenElevation, TokenUser,
};
use windows_sys::Win32::Storage::FileSystem::{FILE_FLAG_FIRST_PIPE_INSTANCE, FlushFileBuffers, PIPE_ACCESS_DUPLEX};
use windows_sys::Win32::System::Console::{AllocConsole, SetConsoleCtrlHandler};
use windows_sys::Win32::System::Pipes::{
    ConnectNamedPipe, CreateNamedPipeW, DisconnectNamedPipe, GetNamedPipeClientProcessId, PIPE_READMODE_BYTE,
    PIPE_REJECT_REMOTE_CLIENTS, PIPE_TYPE_BYTE, PIPE_UNLIMITED_INSTANCES, PIPE_WAIT,
};
use windows_sys::Win32::System::Threading::{
    GetCurrentProcess, OpenProcess, OpenProcessToken, PROCESS_QUERY_LIMITED_INFORMATION,
};

use crate::server::Server;

pub const SERVICE: &str = "HpcHubVpn";

static SERVE: OnceLock<(Arc<Server>, String)> = OnceLock::new();

define_windows_service!(ffi_service_main, service_main);

/// As the service when the SCM started us, else in the foreground.
pub fn run(server: Server, pipe: String) -> Result<(), String> {
    let server = Arc::new(server);
    let _ = SERVE.set((server.clone(), pipe.clone()));
    match service_dispatcher::start(SERVICE, ffi_service_main) {
        Ok(()) => Ok(()),
        Err(windows_service::Error::Winapi(e))
            if e.raw_os_error() == Some(ERROR_FAILED_SERVICE_CONTROLLER_CONNECT as i32) =>
        {
            serve_pipe(server, &pipe)
        }
        Err(e) => Err(format!("Can't start as a service: {e}")),
    }
}

/// The service ignores console events: it only has a console so it can send Ctrl+Break to openconnect.
unsafe extern "system" fn ignore_console_event(_event: u32) -> i32 {
    1
}

fn service_main(_args: Vec<OsString>) {
    let Some((server, pipe)) = SERVE.get() else { return };
    unsafe {
        AllocConsole();
        SetConsoleCtrlHandler(Some(ignore_console_event), 1);
    }
    let (stop_tx, stop_rx) = mpsc::channel();
    let on_control = {
        let stop_tx = stop_tx.clone();
        move |control| match control {
            ServiceControl::Stop | ServiceControl::Shutdown => {
                let _ = stop_tx.send(());
                ServiceControlHandlerResult::NoError
            }
            ServiceControl::Interrogate => ServiceControlHandlerResult::NoError,
            _ => ServiceControlHandlerResult::NotImplemented,
        }
    };
    let Ok(status) = service_control_handler::register(SERVICE, on_control) else { return };
    let set = |state, accept, code| {
        let _ = status.set_service_status(ServiceStatus {
            service_type: ServiceType::OWN_PROCESS,
            current_state: state,
            controls_accepted: accept,
            exit_code: if code == 0 { ServiceExitCode::Win32(0) } else { ServiceExitCode::ServiceSpecific(code) },
            checkpoint: 0,
            wait_hint: Duration::from_secs(20),
            process_id: None,
        });
    };
    set(ServiceState::Running, ServiceControlAccept::STOP | ServiceControlAccept::SHUTDOWN, 0);
    let (srv, name) = (server.clone(), pipe.clone());
    let failed = thread::spawn(move || {
        let result = serve_pipe(srv, &name);
        if let Err(e) = &result {
            eprintln!("hpc-hub-vpn-helper: {e}");
        }
        let _ = stop_tx.send(());
        result.is_err()
    });
    let _ = stop_rx.recv();
    set(ServiceState::StopPending, ServiceControlAccept::empty(), 0);
    server.tunnel.down();
    let code = if failed.is_finished() && failed.join().unwrap_or(true) { 1 } else { 0 };
    set(ServiceState::Stopped, ServiceControlAccept::empty(), code);
}

struct Handle(HANDLE);

impl Drop for Handle {
    fn drop(&mut self) {
        unsafe { CloseHandle(self.0) };
    }
}

fn wide(s: &str) -> Vec<u16> {
    s.encode_utf16().chain(std::iter::once(0)).collect()
}

/// A security descriptor from SDDL, freed on drop.
struct Descriptor(PSECURITY_DESCRIPTOR);

impl Descriptor {
    fn from_sddl(sddl: &str) -> Result<Self, String> {
        let mut sd: PSECURITY_DESCRIPTOR = null_mut();
        let w = wide(sddl);
        let ok = unsafe {
            ConvertStringSecurityDescriptorToSecurityDescriptorW(w.as_ptr(), SDDL_REVISION_1, &mut sd, null_mut())
        };
        if ok == 0 {
            return Err(format!("Bad pipe security descriptor: {}", std::io::Error::last_os_error()));
        }
        Ok(Descriptor(sd))
    }
}

impl Drop for Descriptor {
    fn drop(&mut self) {
        unsafe { LocalFree(self.0) };
    }
}

pub fn serve_pipe(server: Arc<Server>, name: &str) -> Result<(), String> {
    let sd = Descriptor::from_sddl(&server.config.pipe_sddl())?;
    let name_w = wide(name);
    let mut first = true;
    loop {
        let sa = SECURITY_ATTRIBUTES {
            nLength: size_of::<SECURITY_ATTRIBUTES>() as u32,
            lpSecurityDescriptor: sd.0,
            bInheritHandle: 0,
        };
        // the first instance must be ours: if someone else made the pipe first, fail rather than share it
        let open_mode = PIPE_ACCESS_DUPLEX | if first { FILE_FLAG_FIRST_PIPE_INSTANCE } else { 0 };
        let pipe_mode = PIPE_TYPE_BYTE | PIPE_READMODE_BYTE | PIPE_WAIT | PIPE_REJECT_REMOTE_CLIENTS;
        let h = unsafe {
            CreateNamedPipeW(name_w.as_ptr(), open_mode, pipe_mode, PIPE_UNLIMITED_INSTANCES, 65536, 65536, 0, &sa)
        };
        if h == INVALID_HANDLE_VALUE {
            return Err(format!("Can't create the pipe {name}: {}", std::io::Error::last_os_error()));
        }
        first = false;
        let conn = unsafe { File::from_raw_handle(h as _) }; // closes the handle when dropped
        let connected = unsafe { ConnectNamedPipe(h, null_mut()) } != 0 || unsafe { GetLastError() } == ERROR_PIPE_CONNECTED;
        if !connected {
            continue;
        }
        let server = server.clone();
        thread::spawn(move || {
            let h = conn.as_raw_handle() as HANDLE;
            let caller = client_sid(h);
            server.answer(caller.as_deref(), &conn);
            unsafe {
                FlushFileBuffers(h);
                DisconnectNamedPipe(h);
            }
        });
    }
}

/// The SID of the process at the other end of the pipe, as "S-1-5-21-...".
fn client_sid(pipe: HANDLE) -> Option<String> {
    let mut pid = 0u32;
    if unsafe { GetNamedPipeClientProcessId(pipe, &mut pid) } == 0 {
        return None;
    }
    let process = unsafe { OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, 0, pid) };
    if process.is_null() {
        return None;
    }
    let process = Handle(process);
    let mut token: HANDLE = null_mut();
    if unsafe { OpenProcessToken(process.0, TOKEN_QUERY, &mut token) } == 0 {
        return None;
    }
    let token = Handle(token);
    let mut len = 0u32;
    unsafe { GetTokenInformation(token.0, TokenUser, null_mut(), 0, &mut len) };
    if len == 0 {
        return None;
    }
    let mut buf = vec![0u64; (len as usize).div_ceil(8)]; // u64: aligned for TOKEN_USER
    if unsafe { GetTokenInformation(token.0, TokenUser, buf.as_mut_ptr().cast(), len, &mut len) } == 0 {
        return None;
    }
    let user = unsafe { &*(buf.as_ptr() as *const TOKEN_USER) };
    let mut s: *mut u16 = null_mut();
    if unsafe { ConvertSidToStringSidW(user.User.Sid, &mut s) } == 0 {
        return None;
    }
    let n = (0..).take_while(|&i| unsafe { *s.add(i) } != 0).count();
    let sid = String::from_utf16_lossy(unsafe { std::slice::from_raw_parts(s, n) });
    unsafe { LocalFree(s.cast()) };
    Some(sid)
}

/// Is this process elevated (admin with UAC approved)?
pub fn is_elevated() -> bool {
    let mut token: HANDLE = null_mut();
    if unsafe { OpenProcessToken(GetCurrentProcess(), TOKEN_QUERY, &mut token) } == 0 {
        return false;
    }
    let token = Handle(token);
    let mut elevation = TOKEN_ELEVATION { TokenIsElevated: 0 };
    let mut len = 0u32;
    let ok = unsafe {
        GetTokenInformation(
            token.0,
            TokenElevation,
            (&raw mut elevation).cast(),
            size_of::<TOKEN_ELEVATION>() as u32,
            &mut len,
        )
    };
    ok != 0 && elevation.TokenIsElevated != 0
}
