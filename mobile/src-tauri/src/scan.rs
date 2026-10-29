//! A QR scan with the camera (ScanPlugin.kt): the desktop's code that sets up the phone (core/pairing.py).
//! Desktop builds of this crate (cargo check) have none.

use serde::Deserialize;
use tauri::plugin::{Builder, TauriPlugin};
use tauri::{AppHandle, Manager, Runtime};

#[cfg_attr(not(mobile), allow(dead_code))] // only Android answers
#[derive(Deserialize)]
struct Answer {
    text: String,
}

struct Handle<R: Runtime>(tauri::plugin::PluginHandle<R>);

pub fn init<R: Runtime>() -> TauriPlugin<R> {
    Builder::new("scan")
        .setup(|_app, _api| {
            #[cfg(target_os = "android")]
            _app.manage(Handle(_api.register_android_plugin("io.github.bavanda.hpchub", "ScanPlugin")?));
            Ok(())
        })
        .build()
}

/// Blocks (on a worker thread) until a code is read or you close the camera.
#[tauri::command]
pub async fn scan_qr<R: Runtime>(app: AppHandle<R>) -> Result<String, String> {
    let handle = app.try_state::<Handle<R>>().ok_or("Scanning needs the Android app")?.0.clone();
    tauri::async_runtime::spawn_blocking(move || scan(handle)).await.map_err(|e| e.to_string())?
}

#[cfg(mobile)]
fn scan<R: Runtime>(handle: tauri::plugin::PluginHandle<R>) -> Result<String, String> {
    let none = std::collections::HashMap::<String, String>::new(); // {} not null: the Kotlin side reads an object
    handle.run_mobile_plugin::<Answer>("scan", none).map(|a| a.text).map_err(|e| e.to_string())
}

#[cfg(not(mobile))]
fn scan<R: Runtime>(_handle: tauri::plugin::PluginHandle<R>) -> Result<String, String> {
    Err("Scanning needs the Android app".into())
}
