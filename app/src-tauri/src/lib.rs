//! HPC Hub's window. The Python backend (`python -m hpc_hub.api`) runs as a child process; JSON-RPC lines go
//! to its stdin, and every line it prints comes back to the UI as an "rpc" event. See docs/design/tauri.md.

use std::io::{BufRead, BufReader, Write};
use std::process::{Child, ChildStdin, Command, Stdio};
use std::sync::Mutex;

use tauri::{AppHandle, Emitter, Manager, RunEvent, State};

mod pty;
mod sso;

struct Backend {
    stdin: Mutex<ChildStdin>,
    child: Mutex<Child>,
}

/// One JSON-RPC message from the UI to the backend.
#[tauri::command]
fn rpc_send(line: String, backend: State<Backend>) -> Result<(), String> {
    let mut stdin = backend.stdin.lock().map_err(|e| e.to_string())?;
    writeln!(stdin, "{}", line.trim()).and_then(|_| stdin.flush()).map_err(|e| e.to_string())
}

fn start_backend(app: &AppHandle) -> std::io::Result<Backend> {
    // Development: the repository's Python package. Release builds will ship a frozen backend instead.
    let root = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("../..");
    let python = std::env::var("HPC_HUB_PYTHON")
        .unwrap_or_else(|_| if cfg!(windows) { "python".into() } else { "python3".into() });
    let mut child = Command::new(python)
        .args(["-m", "hpc_hub.api"])
        .current_dir(root)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::inherit())
        .spawn()?;
    let stdout = child.stdout.take().expect("piped stdout");
    let stdin = child.stdin.take().expect("piped stdin");
    let handle = app.clone();
    std::thread::spawn(move || {
        for line in BufReader::new(stdout).lines().map_while(Result::ok) {
            let _ = handle.emit("rpc", line);
        }
        let _ = handle.emit("rpc-closed", ());
    });
    Ok(Backend { stdin: Mutex::new(stdin), child: Mutex::new(child) })
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(pty::Ptys::default())
        .setup(|app| {
            let backend = start_backend(app.handle())?;
            app.manage(backend);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            rpc_send,
            pty::pty_open,
            pty::pty_write,
            pty::pty_resize,
            pty::pty_close,
            sso::sso_open,
            sso::sso_show,
            sso::sso_close
        ])
        .build(tauri::generate_context!())
        .expect("error while building HPC Hub")
        .run(|app, event| {
            if let RunEvent::Exit = event {
                if let Some(backend) = app.try_state::<Backend>() {
                    if let Ok(mut child) = backend.child.lock() {
                        let _ = child.kill();
                    }
                }
            }
        });
}
