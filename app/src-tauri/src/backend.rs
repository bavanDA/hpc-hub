//! The Python backend as a child process: JSON-RPC lines go to its stdin, and every line it prints comes back to
//! the UI as an "rpc" event. Debug builds run `python3 -m hpc_hub.api` from the repository; release builds run
//! the frozen backend that ships next to the app (packaging/build_backend.py). See docs/design/tauri.md.

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

#[cfg(debug_assertions)]
fn command() -> std::io::Result<Command> {
    let root = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("../..");
    let python = std::env::var("HPC_HUB_PYTHON")
        .unwrap_or_else(|_| if cfg!(windows) { "python".into() } else { "python3".into() });
    let mut cmd = Command::new(python);
    cmd.args(["-m", "hpc_hub.api"]).current_dir(root);
    Ok(cmd)
}

#[cfg(not(debug_assertions))]
fn command() -> std::io::Result<Command> {
    // Tauri installs bundle.externalBin next to the app's own executable, without the target triple
    let name = format!("hpc-hub-backend{}", std::env::consts::EXE_SUFFIX);
    Ok(Command::new(std::env::current_exe()?.with_file_name(name)))
}

pub fn start(app: &AppHandle) -> std::io::Result<Backend> {
    // HPC_HUB_BACKEND: run a frozen backend from a debug build too
    let mut cmd = match std::env::var_os("HPC_HUB_BACKEND") {
        Some(exe) => Command::new(exe),
        None => command()?,
    };
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(0x0800_0000); // CREATE_NO_WINDOW: no console flashing up next to the app
    }
    let mut child = cmd.stdin(Stdio::piped()).stdout(Stdio::piped()).stderr(Stdio::inherit()).spawn()?;
    let stdout = child.stdout.take().expect("piped stdout");
    let stdin = child.stdin.take().expect("piped stdin");
    let handle = app.clone();
    std::thread::spawn(move || {
        for line in BufReader::new(stdout).lines().map_while(Result::ok) {
            let _ = handle.emit("rpc", line);
        }
        let _ = handle.emit("rpc-closed", ());
    });
    Ok(Backend { stdin: Mutex::new(Some(stdin)), child: Mutex::new(child) })
}

/// On exit: closing stdin lets the backend finish by itself (a frozen one then removes its unpacked files),
/// and it is killed if it takes too long.
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
            return;
        }
        std::thread::sleep(Duration::from_millis(50));
    }
}
