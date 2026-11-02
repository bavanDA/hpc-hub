//! HPC Hub on Android: the phone screens in a webview, the Python backend as a child process (backend.rs),
//! QR scans with the camera (scan.rs), Duo Mobile opened for its push (duo.rs), web sign-ins (the VPN's, a
//! portal's) in a page of their own (websignin.rs), files, notifications, staying connected and the phone's own
//! voice for Read aloud (phone.rs).
//! See docs/design/android.md.

mod backend;
mod duo;
mod phone;
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
        .plugin(phone::init())
        .plugin(phone::keep_alive_init())
        .plugin(phone::speech_init())
        .setup(|app| {
            let backend = backend::start(app.handle())?;
            app.manage(backend);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![backend::rpc_send, scan::scan_qr, duo::open_duo,
            websignin::web_sign_in, websignin::vpn_sign_in,
            websignin::close_sign_in, phone::pick_files, phone::save_to_downloads, phone::open_with,
            phone::share_file, phone::keep_alive, phone::speech_listen, phone::speech_voices, phone::speech_speak,
            phone::speech_stop])
        .build(tauri::generate_context!())
        .expect("error while building HPC Hub")
        .run(|app, event| {
            if let RunEvent::Exit = event {
                backend::stop(app);
            }
        });
}
