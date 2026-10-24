//! HPC Hub's window. The Python backend runs as a child process (backend.rs) and talks JSON-RPC with the UI.
//! See docs/design/tauri.md.

mod backend;

use tauri::{Manager, RunEvent};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            let backend = backend::start(app.handle())?;
            app.manage(backend);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![backend::rpc_send])
        .build(tauri::generate_context!())
        .expect("error while building HPC Hub")
        .run(|app, event| {
            if let RunEvent::Exit = event {
                backend::stop(app);
            }
        });
}
