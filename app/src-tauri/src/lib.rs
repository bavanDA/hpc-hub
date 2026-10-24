//! HPC Hub's window. The Python backend runs as a child process (backend.rs) and talks JSON-RPC with the UI;
//! terminals run in PTYs (pty.rs). See docs/design/tauri.md.

mod backend;
mod pty;

use tauri::{Manager, RunEvent};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(pty::Ptys::default())
        .setup(|app| {
            let backend = backend::start(app.handle())?;
            app.manage(backend);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            backend::rpc_send,
            pty::pty_open,
            pty::pty_write,
            pty::pty_resize,
            pty::pty_close
        ])
        .build(tauri::generate_context!())
        .expect("error while building HPC Hub")
        .run(|app, event| {
            if let RunEvent::Exit = event {
                backend::stop(app);
            }
        });
}
