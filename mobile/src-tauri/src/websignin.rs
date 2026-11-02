//! A web sign-in inside the app: Android shows the page full screen (WebSignInPlugin.kt) and answers its cookies.
//! web_sign_in: done once some cookies are set (a cluster's portal). vpn_sign_in: the backend's "web-login"
//! question (the VPN's SAML sign-in, as the desktop's sso.rs): the saved username and password are filled in on
//! the sign-in site's own pages, and reaching the final URL is done. The password comes from the backend's
//! askpass socket with the question's one-time token and goes straight to the page, never through the UI.
//! Desktop builds of this crate (cargo check) have none.

use std::collections::HashMap;
use std::io::{BufRead, BufReader, Write};
use std::time::Duration;

use serde::{Deserialize, Serialize};
use tauri::plugin::{Builder, TauriPlugin};
use tauri::{AppHandle, Manager, Runtime, Url};

const SSO_USER: &str = "hpc-hub:sso-username";
const SSO_PASS: &str = "hpc-hub:sso-password";

/// One step per call: email page -> Next, password page -> Sign in. A copy of STEP_JS in hpc_hub/connect/sso.py
/// and app/src-tauri/src/sso.rs (tests/api/test_sso.py checks they are the same); the four %s are filled in order.
const STEP_JS: &str = r#"
(function (u, p, doneUser, donePass) {
  const shown = el => el && el.offsetParent !== null && !el.disabled;
  const pick = sel => [...document.querySelectorAll(sel)].find(shown);
  const set = (el, v) => {
    el.focus();
    // native setter + the events typing makes, so React/Backbone pages (Okta, Microsoft) take the value
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, v);
    el.dispatchEvent(new InputEvent('input', {bubbles: true, inputType: 'insertText', data: v}));
    el.dispatchEvent(new KeyboardEvent('keyup', {bubbles: true, key: 'End'}));
    el.dispatchEvent(new Event('change', {bubbles: true}));
    el.dispatchEvent(new Event('blur'));
  };
  // press Next / Sign in a moment later, once the page has taken the value ("cannot be left blank" otherwise)
  const submit = (el, v) => setTimeout(() => {
    if (el.value !== v) set(el, v);
    const btn = pick('#idSIButton9, button[type=submit], input[type=submit]');
    if (btn) btn.click();
    else if (el.form) el.form.requestSubmit ? el.form.requestSubmit() : el.form.submit();
  }, 700);
  const user = pick('input[name=loginfmt], input[type=email], input[name=username], ' +
                    'input#username, input[name=j_username], input[name=identifier]');
  const pw = pick('input[type=password]');
  if (pw && p && !donePass) {
    if (user && u && !user.value) set(user, u);
    set(pw, p); submit(pw, p); return 'pass';
  }
  if (!pw && user && u && !doneUser) { set(user, u); submit(user, u); return 'user'; }
  return '';
})(%s, %s, %s, %s);
"#;

/// Runs first on every page: notes a link you clicked yourself, so the app stops filling in from then on
/// ("forgot password"...). The same as sso.rs.
const CLICKS_JS: &str = r#"
(function () {
  if (window.top !== window) return;
  let clicked = false;
  try { clicked = sessionStorage.getItem('hpc-hub-link') === '1'; } catch (e) {}
  document.addEventListener('click', function (e) {
    if (!e.isTrusted || !(e.target instanceof Element)) return;
    const a = e.target.closest('a[href]');
    const href = a ? a.getAttribute('href').trim() : '';
    if (!href || href[0] === '#' || /^javascript:/i.test(href)) return;
    clicked = true;
    try { sessionStorage.setItem('hpc-hub-link', '1'); } catch (e) {}
  }, true);
  Object.defineProperty(window, '__hpcHubLinkClicked', { value: function () { return clicked; } });
})();
"#;

/// Sign-in hosts outside the university's own site that may get the password (hpc_hub/connect/sso.py).
const SIGN_IN_HOSTS: [&str; 3] = ["login.microsoftonline.com", "login.microsoft.com", "accounts.google.com"];
/// What WebSignInPlugin.kt puts in for STEP_JS's last two %s on each step.
const DONE_USER: &str = "__hpcHubDoneUser__";
const DONE_PASS: &str = "__hpcHubDonePass__";

/// The part of a host name an organization owns: vpn.njit.edu -> njit.edu, vpn.ox.ac.uk -> ox.ac.uk (sso.rs).
fn site(host: &str) -> String {
    let host = host.to_lowercase();
    let labels: Vec<&str> = host.trim_end_matches('.').split('.').collect();
    let n = labels.len();
    let second = n > 2
        && labels[n - 1].len() == 2
        && ["ac", "co", "edu", "gov", "org", "net", "com"].contains(&labels[n - 2]);
    labels[n.saturating_sub(if second { 3 } else { 2 })..].join(".")
}

fn decode(s: &str) -> String {
    let b = s.as_bytes();
    let mut out = Vec::with_capacity(b.len());
    let mut i = 0;
    while i < b.len() {
        let hex = |c: u8| (c as char).to_digit(16);
        if b[i] == b'%' && i + 2 < b.len() {
            if let (Some(h), Some(l)) = (hex(b[i + 1]), hex(b[i + 2])) {
                out.push((h * 16 + l) as u8);
                i += 3;
                continue;
            }
        }
        out.push(b[i]);
        i += 1;
    }
    String::from_utf8_lossy(&out).into_owned()
}

/// STEP_JS with the login in it; the plugin fills in what is done so far.
fn fill_script(username: &str, password: &str) -> String {
    let json = |s: &str| serde_json::to_string(s).unwrap_or_default();
    let parts: Vec<&str> = STEP_JS.trim().split("%s").collect();
    let values = [json(username), json(password), DONE_USER.into(), DONE_PASS.into()];
    let mut out = parts[0].to_string();
    for (value, part) in values.iter().zip(&parts[1..]) {
        out.push_str(value);
        out.push_str(part);
    }
    out
}

#[derive(Serialize, Default)]
#[serde(rename_all = "camelCase")]
struct Args {
    url: String,
    title: String,
    cookies: Vec<String>,
    close_is_done: bool,
    final_url: String,
    fill: String,
    clicks: String,
    fill_site: String,
    fill_hosts: Vec<String>,
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

fn handle<R: Runtime>(app: &AppHandle<R>) -> Result<tauri::plugin::PluginHandle<R>, String> {
    Ok(app.try_state::<Handle<R>>().ok_or("Web sign-in needs the Android app")?.0.clone())
}

/// Blocks (on a worker thread) until you are signed in or close the page. close_is_done: a page you fill in
/// yourself (a key upload), where closing it is done, not cancelled.
#[tauri::command]
pub async fn web_sign_in<R: Runtime>(app: AppHandle<R>, url: String, title: String, cookies: Vec<String>,
    close_is_done: Option<bool>) -> Result<HashMap<String, String>, String> {
    let handle = handle(&app)?;
    let args = Args { url, title, cookies, close_is_done: close_is_done.unwrap_or(false), ..Args::default() };
    tauri::async_runtime::spawn_blocking(move || open(handle, args))
        .await
        .map_err(|e| e.to_string())?
}

#[derive(Deserialize)]
pub struct Fill {
    socket: String,
    token: String,
}

/// What the backend's "web-login" question says (hpc_hub/api/hub.py web_login).
#[derive(Deserialize)]
pub struct SignIn {
    title: String,
    login_url: String,
    final_url: String,
    token_cookie: String,
    error_cookie: String,
    fill: Option<Fill>,
}

#[derive(Serialize)]
pub struct Done {
    token: String,
    error: String,
}

/// One answer for the backend's askpass socket, as the desktop's sso.rs asks it.
fn ask(fill: &Fill, prompt: &str) -> Option<String> {
    let mut sock = std::os::unix::net::UnixStream::connect(&fill.socket).ok()?;
    sock.set_read_timeout(Some(Duration::from_secs(10))).ok()?;
    let line = serde_json::json!({"token": fill.token, "prompt": prompt}).to_string();
    sock.write_all(format!("{line}\n").as_bytes()).ok()?;
    let mut reply = String::new();
    BufReader::new(sock).read_line(&mut reply).ok()?;
    let v: serde_json::Value = serde_json::from_str(&reply).ok()?;
    if v["ok"].as_bool()? { v["answer"].as_str().map(String::from) } else { None }
}

/// The VPN's web sign-in: {token} once the final URL is reached, or {error}. Blocks on a worker thread.
#[tauri::command]
pub async fn vpn_sign_in<R: Runtime>(app: AppHandle<R>, req: SignIn) -> Result<Done, String> {
    let handle = handle(&app)?;
    let start = Url::parse(&req.login_url).map_err(|e| e.to_string())?;
    if start.scheme() != "https" {
        return Err("The sign-in page is not https".into());
    }
    let home = start.host_str().map(site).unwrap_or_default();
    tauri::async_runtime::spawn_blocking(move || {
        let (username, password) = match &req.fill {
            Some(fill) => (ask(fill, SSO_USER).unwrap_or_default(), ask(fill, SSO_PASS).unwrap_or_default()),
            None => (String::new(), String::new()),
        };
        // Okta only as the university's own tenant (njit.okta.com for vpn.njit.edu): anyone can make one
        let mut hosts: Vec<String> = SIGN_IN_HOSTS.iter().map(|h| h.to_string()).collect();
        if let Some(org) = home.split('.').next().filter(|s| !s.is_empty()) {
            hosts.push(format!("{org}.okta.com"));
        }
        let args = Args {
            url: req.login_url,
            title: req.title,
            final_url: req.final_url,
            cookies: vec![],
            fill: if password.is_empty() { String::new() } else { fill_script(&username, &password) },
            clicks: CLICKS_JS.trim().into(),
            fill_site: home,
            fill_hosts: hosts,
            ..Args::default()
        };
        let jar = match open(handle, args) {
            Ok(jar) => jar,
            Err(e) => return Done { token: String::new(), error: e },
        };
        let token = jar.get(&req.token_cookie).cloned().unwrap_or_default();
        let error = decode(jar.get(&req.error_cookie).map(String::as_str).unwrap_or(""));
        if !token.is_empty() {
            Done { token, error: String::new() }
        } else {
            Done { token, error: if error.is_empty() { "No sign-in token from the site".into() } else { error } }
        }
    })
    .await
    .map_err(|e| e.to_string())
}

/// Closes the sign-in page if one is open (its question was answered or cancelled elsewhere).
#[tauri::command]
pub async fn close_sign_in<R: Runtime>(app: AppHandle<R>) -> Result<(), String> {
    let handle = handle(&app)?;
    tauri::async_runtime::spawn_blocking(move || close(handle)).await.map_err(|e| e.to_string())?
}

#[cfg(mobile)]
fn open<R: Runtime>(handle: tauri::plugin::PluginHandle<R>, args: Args) -> Result<HashMap<String, String>, String> {
    handle.run_mobile_plugin::<Answer>("open", args).map(|a| a.cookies).map_err(|e| e.to_string())
}

#[cfg(mobile)]
fn close<R: Runtime>(handle: tauri::plugin::PluginHandle<R>) -> Result<(), String> {
    let none = HashMap::<String, String>::new(); // {} not null: the Kotlin side reads an object
    handle.run_mobile_plugin::<()>("close", none).map_err(|e| e.to_string())
}

#[cfg(not(mobile))]
fn open<R: Runtime>(_handle: tauri::plugin::PluginHandle<R>, _args: Args) -> Result<HashMap<String, String>, String> {
    Err("Web sign-in needs the Android app".into())
}

#[cfg(not(mobile))]
fn close<R: Runtime>(_handle: tauri::plugin::PluginHandle<R>) -> Result<(), String> {
    Err("Web sign-in needs the Android app".into())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_login_goes_in_once_and_never_into_the_done_flags() {
        let script = fill_script("jdoe%s", "p\"w%s");
        assert!(script.ends_with(r#"})("jdoe%s", "p\"w%s", __hpcHubDoneUser__, __hpcHubDonePass__);"#));
        assert_eq!(site("vpn.njit.edu"), "njit.edu");
        assert_eq!(site("access.yale.edu"), "yale.edu");
    }

    #[test]
    fn error_cookie_is_unescaped() {
        assert_eq!(decode("Account%20locked"), "Account locked");
    }
}
