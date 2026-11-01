//! HPC Hub on Android: the phone screens in a webview, the Python backend as a child process (backend.rs),
//! QR scans with the camera (scan.rs), Duo Mobile opened for its push (duo.rs), web sign-ins in a page of their
//! own (websignin.rs).
//! See docs/design/android.md.

mod backend;
mod duo;
mod scan;
mod websignin;

use tauri::{Manager, RunEvent};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(scan::init())
        .plugin(duo::init())
        .plugin(websignin::init())
        .setup(|app| {
            let backend = backend::start(app.handle())?;
            app.manage(backend);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![backend::rpc_send, scan::scan_qr, duo::open_duo,
            websignin::web_sign_in])
        .build(tauri::generate_context!())
        .expect("error while building HPC Hub")
        .run(|app, event| {
            if let RunEvent::Exit = event {
                backend::stop(app);
            }
        });
}
