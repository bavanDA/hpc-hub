//! Opens Duo Mobile (DuoPlugin.kt) when a login waits for its push. Desktop builds of this crate (cargo check)
//! have none.

use tauri::plugin::{Builder, TauriPlugin};
use tauri::{AppHandle, Manager, Runtime};

struct Handle<R: Runtime>(tauri::plugin::PluginHandle<R>);

pub fn init<R: Runtime>() -> TauriPlugin<R> {
    Builder::new("duo")
        .setup(|_app, _api| {
            #[cfg(target_os = "android")]
            _app.manage(Handle(_api.register_android_plugin("io.github.bavanda.hpchub", "DuoPlugin")?));
            Ok(())
        })
        .build()
}

#[tauri::command]
pub async fn open_duo<R: Runtime>(app: AppHandle<R>) -> Result<(), String> {
    let handle = app.try_state::<Handle<R>>().ok_or("Opening Duo needs the Android app")?.0.clone();
    tauri::async_runtime::spawn_blocking(move || open(handle)).await.map_err(|e| e.to_string())?
}

#[cfg(mobile)]
fn open<R: Runtime>(handle: tauri::plugin::PluginHandle<R>) -> Result<(), String> {
    let none = std::collections::HashMap::<String, String>::new(); // {} not null: the Kotlin side reads an object
    handle.run_mobile_plugin::<()>("open", none).map_err(|e| e.to_string())
}

#[cfg(not(mobile))]
fn open<R: Runtime>(_handle: tauri::plugin::PluginHandle<R>) -> Result<(), String> {
    Err("Opening Duo needs the Android app".into())
}
