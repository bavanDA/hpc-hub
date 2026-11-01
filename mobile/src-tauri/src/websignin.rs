//! A web sign-in inside the app (a cluster's portal): Android shows the page full screen (WebSignInPlugin.kt) and
//! answers the sign-in cookies once they are set. Kept for the VPN and portal sign-ins to come; no screen uses it yet.
//! Desktop builds of this crate (cargo check) have none.

use std::collections::HashMap;

use serde::{Deserialize, Serialize};
use tauri::plugin::{Builder, TauriPlugin};
use tauri::{AppHandle, Manager, Runtime};

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct Args {
    url: String,
    title: String,
    cookies: Vec<String>,
    close_is_done: bool,
}

#[cfg_attr(not(mobile), allow(dead_code))] // only Android answers
#[derive(Deserialize)]
struct Answer {
    cookies: HashMap<String, String>,
}

struct Handle<R: Runtime>(tauri::plugin::PluginHandle<R>);

pub fn init<R: Runtime>() -> TauriPlugin<R> {
    Builder::new("websignin")
        .setup(|_app, _api| {
            #[cfg(target_os = "android")]
            _app.manage(Handle(_api.register_android_plugin("io.github.bavanda.hpchub", "WebSignInPlugin")?));
            Ok(())
        })
        .build()
}

/// Blocks (on a worker thread) until you are signed in or close the page. close_is_done: a page you fill in
/// yourself (a key upload), where closing it is done, not cancelled.
#[tauri::command]
pub async fn web_sign_in<R: Runtime>(app: AppHandle<R>, url: String, title: String, cookies: Vec<String>,
    close_is_done: Option<bool>) -> Result<HashMap<String, String>, String> {
    let handle = app.try_state::<Handle<R>>().ok_or("Web sign-in needs the Android app")?.0.clone();
    let args = Args { url, title, cookies, close_is_done: close_is_done.unwrap_or(false) };
    tauri::async_runtime::spawn_blocking(move || open(handle, args))
        .await
        .map_err(|e| e.to_string())?
}

#[cfg(mobile)]
fn open<R: Runtime>(handle: tauri::plugin::PluginHandle<R>, args: Args) -> Result<HashMap<String, String>, String> {
    handle.run_mobile_plugin::<Answer>("open", args).map(|a| a.cookies).map_err(|e| e.to_string())
}

#[cfg(not(mobile))]
fn open<R: Runtime>(_handle: tauri::plugin::PluginHandle<R>, _args: Args) -> Result<HashMap<String, String>, String> {
    Err("Web sign-in needs the Android app".into())
}
