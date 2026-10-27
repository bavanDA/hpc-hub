//! The Python backend as a child process, as on the desktop (app/src-tauri/src/backend.rs): JSON-RPC lines go to
//! its stdin, and every line it prints comes back to the UI as an "rpc" event. The program is the launcher that
//! ships in the APK's native libraries; MainActivity (PythonSetup.kt) has already put the Python files in place
//! and set the environment it inherits, HPC_HUB_LAUNCHER included.

use std::io::{BufRead, BufReader, Write};
use std::process::{Child, ChildStdin, Command, Stdio};
use std::sync::Mutex;
use std::time::{Duration, Instant};

use tauri::{AppHandle, Emitter, Manager, State};

pub struct Backend {
    stdin: Mutex<Option<ChildStdin>>,
    child: Mutex<Child>,
}

/// One JSON-RPC message from the UI to the backend.
#[tauri::command]
pub fn rpc_send(line: String, backend: State<Backend>) -> Result<(), String> {
    let mut stdin = backend.stdin.lock().map_err(|e| e.to_string())?;
    let stdin = stdin.as_mut().ok_or("The backend has stopped")?;
    writeln!(stdin, "{}", line.trim()).and_then(|_| stdin.flush()).map_err(|e| e.to_string())
}

pub fn start(app: &AppHandle) -> std::io::Result<Backend> {
    let launcher = std::env::var_os("HPC_HUB_LAUNCHER")
        .ok_or_else(|| std::io::Error::other("HPC_HUB_LAUNCHER is not set (PythonSetup did not run)"))?;
    let mut child = Command::new(launcher)
        .args(["-m", "hpc_hub.api"])
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()?;
    let stdout = child.stdout.take().expect("piped stdout");
    let stderr = child.stderr.take().expect("piped stderr");
    let stdin = child.stdin.take().expect("piped stdin");
    let handle = app.clone();
    std::thread::spawn(move || {
        for line in BufReader::new(stdout).lines().map_while(Result::ok) {
            let _ = handle.emit("rpc", line);
        }
        let _ = handle.emit("rpc-closed", ());
    });
    // Android has no terminal for stderr: it goes to logcat (adb logcat -s hpc-hub-backend)
    std::thread::spawn(move || {
        for line in BufReader::new(stderr).lines().map_while(Result::ok) {
            log(&line);
        }
    });
    Ok(Backend { stdin: Mutex::new(Some(stdin)), child: Mutex::new(child) })
}

/// On exit: closing stdin lets the backend finish by itself, and it is killed if it takes too long.
pub fn stop(app: &AppHandle) {
    let Some(backend) = app.try_state::<Backend>() else { return };
    if let Ok(mut stdin) = backend.stdin.lock() {
        stdin.take();
    }
    let Ok(mut child) = backend.child.lock() else { return };
    let deadline = Instant::now() + Duration::from_secs(2);
    while matches!(child.try_wait(), Ok(None)) {
        if Instant::now() > deadline {
            let _ = child.kill();
            break;
        }
        std::thread::sleep(Duration::from_millis(50));
    }
}

#[cfg(target_os = "android")]
fn log(line: &str) {
    use std::ffi::CString;
    #[link(name = "log")]
    unsafe extern "C" {
        fn __android_log_write(prio: i32, tag: *const std::ffi::c_char, text: *const std::ffi::c_char) -> i32;
    }
    let (Ok(tag), Ok(text)) = (CString::new("hpc-hub-backend"), CString::new(line.replace('\0', ""))) else {
        return;
    };
    unsafe { __android_log_write(4, tag.as_ptr(), text.as_ptr()) }; // 4: INFO
}

#[cfg(not(target_os = "android"))]
fn log(line: &str) {
    eprintln!("{line}");
}
