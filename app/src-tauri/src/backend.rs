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

fn override_backend(exe: Option<std::ffi::OsString>) -> Option<std::ffi::OsString> {
    exe.filter(|_| cfg!(debug_assertions))
}

pub fn start(app: &AppHandle) -> std::io::Result<Backend> {
    // HPC_HUB_BACKEND: run a frozen backend from a debug build too. Never in a release build: anything that can
    // set your environment could otherwise have HPC Hub start its program with your logins.
    let mut cmd = match override_backend(std::env::var_os("HPC_HUB_BACKEND")) {
        Some(exe) => Command::new(exe),
        None => command()?,
    };
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(0x0800_0000); // CREATE_NO_WINDOW: no console flashing up next to the app
    }
    // where openconnect and the VPN helper ship (hpc_hub/core/paths.py resources_dir)
    if let Ok(dir) = app.path().resource_dir() {
        cmd.env("HPC_HUB_RESOURCES", dir);
    }
    // quick fixes: where they're kept, and the one in use (quickfix.rs)
    if let Some(fix) = app.try_state::<Option<crate::quickfix::QuickFix>>() {
        for (key, value) in fix.inner().iter().flat_map(|f| f.backend_env()) {
            cmd.env(key, value);
        }
    }
    let mut child = cmd.stdin(Stdio::piped()).stdout(Stdio::piped()).stderr(Stdio::inherit()).spawn()?;
    let stdout = child.stdout.take().expect("piped stdout");
    let stdin = child.stdin.take().expect("piped stdin");
    let handle = app.clone();
    std::thread::spawn(move || {
        for line in BufReader::new(stdout).lines().map_while(Result::ok) {
            // an argv the backend made for a terminal: the window may start it (pty.rs); the page needn't see it
            if let Some(argv) = crate::pty::made_argv(&line) {
                if let Some(ptys) = handle.try_state::<crate::pty::Ptys>() {
                    ptys.allow(argv);
                }
                continue;
            }
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn hpc_hub_backend_is_for_debug_builds_only() {
        let exe = Some(std::ffi::OsString::from("/tmp/other-backend"));
        assert_eq!(override_backend(exe.clone()).is_some(), cfg!(debug_assertions));
        assert!(override_backend(None).is_none());
        let src = include_str!("backend.rs");
        assert!(src.contains("override_backend(std::env::var_os(\"HPC_HUB_BACKEND\"))"));
    }

    #[test]
    fn the_window_allows_no_plugins_base_or_form_posts() {
        let conf: serde_json::Value = serde_json::from_str(include_str!("../tauri.conf.json")).unwrap();
        let csp = conf["app"]["security"]["csp"].as_str().unwrap();
        for rule in ["object-src 'none'", "base-uri 'none'", "form-action 'none'", "default-src 'self'"] {
            assert!(csp.split(';').any(|r| r.trim() == rule), "no {rule} in {csp}");
        }
    }
}
