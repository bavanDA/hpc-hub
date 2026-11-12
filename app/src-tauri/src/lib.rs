//! HPC Hub's window. The Python backend runs as a child process (backend.rs) and talks JSON-RPC with the UI;
//! terminals run in PTYs (pty.rs). See docs/design/tauri.md.

mod backend;
mod pty;
mod sso;

use tauri::{Manager, RunEvent};

/// Before an update is installed: stop the backend, so the installer can replace its program (Windows can't replace
/// a running .exe). Connections on the cluster (tmux, jobs) keep running; the new version picks them up.
#[tauri::command]
fn update_ready(app: tauri::AppHandle) {
    backend::stop(&app);
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
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
            pty::pty_close,
            sso::sso_open,
            sso::sso_show,
            sso::sso_close,
            update_ready
        ])
        .build(tauri::generate_context!())
        .expect("error while building HPC Hub")
        .run(|app, event| {
            if let RunEvent::Exit = event {
                backend::stop(app);
            }
        });
}
