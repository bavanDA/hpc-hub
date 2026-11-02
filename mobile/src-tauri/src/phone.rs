//! What only the phone does: pick files and copy them in, save into Downloads, open or share with other apps
//! (FilesPlugin.kt), and stay connected in the background (KeepAliveService.kt). The screens call these through
//! mobile/src/parts/native.ts. Desktop builds of this crate (cargo check) have none.

use serde::{Deserialize, Serialize};
use serde_json::Value;
use tauri::plugin::{Builder, TauriPlugin};
use tauri::{AppHandle, Manager, Runtime};

struct Files<R: Runtime>(tauri::plugin::PluginHandle<R>);
struct KeepAlive<R: Runtime>(tauri::plugin::PluginHandle<R>);

// One Tauri plugin per Kotlin plugin: Android keeps one Kotlin plugin per name, so a second one under the same
// name would take the first one's place.
pub fn init<R: Runtime>() -> TauriPlugin<R> {
    Builder::new("phone")
        .setup(|_app, _api| {
            #[cfg(target_os = "android")]
            _app.manage(Files(_api.register_android_plugin("io.github.bavanda.hpchub", "FilesPlugin")?));
            Ok(())
        })
        .build()
}

pub fn keep_alive_init<R: Runtime>() -> TauriPlugin<R> {
    Builder::new("keepalive")
        .setup(|_app, _api| {
            #[cfg(target_os = "android")]
            _app.manage(KeepAlive(_api.register_android_plugin("io.github.bavanda.hpchub", "KeepAlivePlugin")?));
            Ok(())
        })
        .build()
}

const NOT_HERE: &str = "This only works in the Android app";

/// Runs a Kotlin command on a worker thread (pickers wait for you) and hands back its answer as JSON.
async fn call<R: Runtime, A: Serialize + Send + 'static>(
    handle: tauri::plugin::PluginHandle<R>,
    command: &'static str,
    args: A,
) -> Result<Value, String> {
    tauri::async_runtime::spawn_blocking(move || run(handle, command, args)).await.map_err(|e| e.to_string())?
}

#[cfg(mobile)]
fn run<R: Runtime, A: Serialize>(handle: tauri::plugin::PluginHandle<R>, command: &str, args: A) -> Result<Value, String> {
    handle.run_mobile_plugin::<Value>(command, args).map_err(|e| e.to_string())
}

#[cfg(not(mobile))]
fn run<R: Runtime, A: Serialize>(_handle: tauri::plugin::PluginHandle<R>, _command: &str, _args: A) -> Result<Value, String> {
    Err(NOT_HERE.into())
}

fn files<R: Runtime>(app: &AppHandle<R>) -> Result<tauri::plugin::PluginHandle<R>, String> {
    Ok(app.try_state::<Files<R>>().ok_or(NOT_HERE)?.0.clone())
}

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PickArgs {
    multiple: bool,
    mime: Vec<String>,
}

/// Android's file picker; the chosen files come back copied into the app's cache: {files: [{name, path, size, mime}]}.
#[tauri::command]
pub async fn pick_files<R: Runtime>(app: AppHandle<R>, multiple: Option<bool>, mime: Option<Vec<String>>) -> Result<Value, String> {
    let args = PickArgs { multiple: multiple.unwrap_or(false), mime: mime.unwrap_or_default() };
    call(files(&app)?, "pick", args).await
}

#[derive(Serialize)]
struct SaveArgs {
    path: String,
    name: String,
}

/// Moves a cached file into Downloads/HPC Hub: {uri, place}.
#[tauri::command]
pub async fn save_to_downloads<R: Runtime>(app: AppHandle<R>, path: String, name: String) -> Result<Value, String> {
    call(files(&app)?, "save", SaveArgs { path, name }).await
}

#[derive(Serialize)]
struct OpenArgs {
    path: String,
    mime: Option<String>,
}

#[tauri::command]
pub async fn open_with<R: Runtime>(app: AppHandle<R>, path: String, mime: Option<String>) -> Result<Value, String> {
    call(files(&app)?, "open", OpenArgs { path, mime }).await
}

#[derive(Serialize)]
struct ShareArgs {
    path: Option<String>,
    text: Option<String>,
    title: Option<String>,
}

#[tauri::command]
pub async fn share_file<R: Runtime>(
    app: AppHandle<R>,
    path: Option<String>,
    text: Option<String>,
    title: Option<String>,
) -> Result<Value, String> {
    call(files(&app)?, "share", ShareArgs { path, text, title }).await
}

#[derive(Serialize)]
struct KeepAliveArgs {
    on: bool,
    text: Option<String>,
}

#[tauri::command]
pub async fn keep_alive<R: Runtime>(app: AppHandle<R>, on: bool, text: Option<String>) -> Result<Value, String> {
    let handle = app.try_state::<KeepAlive<R>>().ok_or(NOT_HERE)?.0.clone();
    call(handle, "set", KeepAliveArgs { on, text }).await
}
