//! HPC Hub's window. The Python backend runs as a child process (backend.rs) and talks JSON-RPC with the UI;
//! terminals run in PTYs (pty.rs). See docs/design/tauri.md.

mod hostenv;
mod backend;
mod pty;
mod quickfix;
mod sso;

use tauri::{Manager, RunEvent};

/// Before an update is installed: stop the backend, so the installer can replace its program (Windows can't replace
/// a running .exe). Connections on the cluster (tmux, jobs) keep running; the new version picks them up.
#[tauri::command]
fn update_ready(app: tauri::AppHandle) {
    backend::stop(&app);
}

/// The beta channel's update file: a rolling pre-release, which the normal check (releases/latest) never sees.
const BETA_UPDATES: &str = "https://github.com/bavanDA/hpc-hub/releases/download/beta/latest.json";

/// With Beta updates on, the newest beta, if newer than this version. Answers what the updater plugin's own check
/// answers (the update kept in the resources table under rid), so the window downloads and installs it the same way.
#[tauri::command]
async fn check_beta_update(webview: tauri::Webview) -> Result<Option<serde_json::Value>, String> {
    use tauri_plugin_updater::UpdaterExt;
    let url = tauri::Url::parse(BETA_UPDATES).map_err(|e| e.to_string())?;
    let updater = webview.updater_builder().endpoints(vec![url]).map_err(|e| e.to_string())?
        .build().map_err(|e| e.to_string())?;
    let Some(update) = updater.check().await.map_err(|e| e.to_string())? else { return Ok(None) };
    let found = serde_json::json!({
        "currentVersion": update.current_version, "version": update.version, "date": null,
        "body": update.body, "rawJson": update.raw_json,
    });
    let rid = webview.resources_table().add(update);
    let mut found = found;
    found["rid"] = rid.into();
    Ok(Some(found))
}

/// HPC Hub's window, back in front: not minimized, shown, focused. Opening HPC Hub again while it runs does this
/// instead of starting a second copy (which could only say "already open": two would fight over the clusters).
fn bring_back(app: &tauri::AppHandle) {
    if let Some(w) = app.get_webview_window("main") {
        let _ = w.unminimize();
        let _ = w.show();
        let _ = w.set_focus();
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let mut context = tauri::generate_context!();
    let fix = quickfix::apply(&mut context);
    tauri::Builder::default()
        // first, so a second copy hands over to this one and quits before it starts anything of its own
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| bring_back(app)))
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .manage(pty::Ptys::default())
        .manage(fix)
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
            update_ready,
            check_beta_update,
            quickfix::quick_fix_started
        ])
        .build(context)
        .expect("error while building HPC Hub")
        .run(|app, event| match event {
            RunEvent::Exit => backend::stop(app),
            // macOS: clicking the Dock icon of the running app
            #[cfg(target_os = "macos")]
            RunEvent::Reopen { .. } => bring_back(app),
            _ => {}
        });
}
