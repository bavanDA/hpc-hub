//! HPC Hub on Android: the phone screens in a webview, the Python backend as a child process (backend.rs),
//! QR scans with the camera (scan.rs).
//! See docs/design/android.md.

mod backend;
mod scan;

use tauri::{Manager, RunEvent};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(scan::init())
        .setup(|app| {
            let backend = backend::start(app.handle())?;
            app.manage(backend);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![backend::rpc_send, scan::scan_qr])
        .build(tauri::generate_context!())
        .expect("error while building HPC Hub")
        .run(|app, event| {
            if let RunEvent::Exit = event {
                backend::stop(app);
            }
        });
}
