//! The VPN's web sign-in in a window of its own, like the GTK app's (hpc_hub/connect/ui/web_login.py): it loads
//! the sign-in page, fills the saved username and password (only on pages `may_fill` allows, once each, and
//! not after you clicked a link yourself), you approve Duo, and when the final URL is reached it reads the
//! token cookie and reports back to the main window ("sso-result"), which answers the backend's question.
//!
//! The password never passes through the UI: the backend hands the UI a one-time askpass token, and this module
//! asks the backend's askpass socket for the login with it (on Windows a port of 127.0.0.1, "tcp:127.0.0.1:<port>",
//! since there is no Unix socket). The page gets no IPC (no capability names it).

use std::io::{BufRead, BufReader, Read, Write};
use std::sync::{Arc, Mutex};
use std::time::Duration;

use serde::{Deserialize, Serialize};
use tauri::webview::PageLoadEvent;
use tauri::{AppHandle, Emitter, Manager, Url, WebviewUrl, WebviewWindow, WebviewWindowBuilder, WindowEvent};

const SETTLE: u64 = 2800; // ms before typing into a freshly loaded page (sign-in pages finish their scripts late)
const POLL: u64 = 800;
const SSO_USER: &str = "hpc-hub:sso-username";
const SSO_PASS: &str = "hpc-hub:sso-password";

/// One step per call: email page -> Next, password page -> Sign in. Returns what it did. A copy of STEP_JS in
/// hpc_hub/connect/sso.py (tests/api/test_sso.py checks they are the same); the four %s are filled in order.
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

/// Runs first on every page: notes a link you clicked yourself (GTK: LINK_CLICKED with a user gesture), so the
/// app stops filling in from then on ("forgot password"...). Kept for the tab's life in sessionStorage too.
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

const CLICKED: &str = "!!(window.__hpcHubLinkClicked && window.__hpcHubLinkClicked())";

/// Sign-in hosts outside the university's own site that may get the password (hpc_hub/connect/sso.py).
const SIGN_IN_HOSTS: [&str; 3] = ["login.microsoftonline.com", "login.microsoft.com", "accounts.google.com"];

/// The part of a host name an organization owns: vpn.njit.edu -> njit.edu, vpn.ox.ac.uk -> ox.ac.uk.
pub fn site(host: &str) -> String {
    let host = host.to_lowercase();
    let labels: Vec<&str> = host.trim_end_matches('.').split('.').collect();
    let n = labels.len();
    let second = n > 2
        && labels[n - 1].len() == 2
        && ["ac", "co", "edu", "gov", "org", "net", "com"].contains(&labels[n - 2]);
    labels[n.saturating_sub(if second { 3 } else { 2 })..].join(".")
}

/// Type the password only over https, on the sign-in start page's own site or a known sign-in host, so a link
/// or redirect to another site never gets it. Okta only as the university's own tenant.
pub fn may_fill(uri: &str, start: &str) -> bool {
    let Ok(page) = Url::parse(uri) else { return false };
    let host = page.host_str().unwrap_or("").to_lowercase();
    let home = Url::parse(start).ok().and_then(|u| u.host_str().map(site)).unwrap_or_default();
    if page.scheme() != "https" || host.is_empty() {
        return false;
    }
    let okta = home.split('.').next().filter(|s| !s.is_empty()).map(|s| format!("{s}.okta.com"));
    SIGN_IN_HOSTS.contains(&host.as_str())
        || okta.as_deref() == Some(host.as_str())
        || (!home.is_empty() && (host == home || host.ends_with(&format!(".{home}"))))
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

#[derive(Deserialize)]
pub struct Fill {
    socket: String,
    token: String,
}

/// What the backend's "web-login" question says (hpc_hub/api/hub.py web_login).
#[derive(Deserialize)]
pub struct SignIn {
    id: String,
    title: String,
    login_url: String,
    final_url: String,
    token_cookie: String,
    error_cookie: String,
    fill: Option<Fill>,
}

#[derive(Clone, Serialize)]
struct Done {
    id: String,
    token: String,
    error: String,
}

#[derive(Clone, Serialize)]
struct Status {
    id: String,
    text: String,
}

#[derive(Default)]
struct Run {
    id: String,
    start: String,
    final_url: String,
    token_cookie: String,
    error_cookie: String,
    username: String,
    password: String,
    done_user: bool,
    done_pass: bool,
    off: bool, // you clicked a link yourself: from then on you type
    timer: bool,
    reading: bool,
    finished: bool,
}

type Shared = Arc<Mutex<Run>>;

fn label(id: &str) -> String {
    format!("sso-{id}")
}

/// The saved login from the backend's askpass server: one JSON line each way, with the one-time token.
fn ask(fill: &Fill, prompt: &str) -> Option<String> {
    let line = serde_json::json!({"token": fill.token, "prompt": prompt}).to_string();
    if let Some(addr) = fill.socket.strip_prefix("tcp:") {
        let addr: std::net::SocketAddr = addr.parse().ok()?;
        if !addr.ip().is_loopback() {
            return None; // the token only ever goes to this computer
        }
        let sock = std::net::TcpStream::connect_timeout(&addr, Duration::from_secs(5)).ok()?;
        sock.set_read_timeout(Some(Duration::from_secs(10))).ok()?;
        return talk(sock, &line);
    }
    #[cfg(unix)]
    {
        let sock = std::os::unix::net::UnixStream::connect(&fill.socket).ok()?;
        sock.set_read_timeout(Some(Duration::from_secs(10))).ok()?;
        talk(sock, &line)
    }
    #[cfg(not(unix))]
    None
}

fn talk(mut sock: impl Read + Write, line: &str) -> Option<String> {
    sock.write_all(format!("{line}\n").as_bytes()).ok()?;
    let mut reply = String::new();
    BufReader::new(sock).read_line(&mut reply).ok()?;
    let v: serde_json::Value = serde_json::from_str(&reply).ok()?;
    if v["ok"].as_bool()? { v["answer"].as_str().map(String::from) } else { None }
}

fn status(app: &AppHandle, run: &Shared, text: &str) {
    let id = run.lock().map(|r| r.id.clone()).unwrap_or_default();
    let _ = app.emit_to("main", "sso-status", Status { id, text: text.into() });
}

/// Report once: the token, or why there is none. The login is forgotten here.
fn finish(app: &AppHandle, run: &Shared, token: String, error: &str) {
    let Ok(mut r) = run.lock() else { return };
    if r.finished {
        return;
    }
    r.finished = true;
    r.password.clear();
    let done = Done { id: r.id.clone(), token, error: error.into() };
    drop(r);
    let _ = app.emit_to("main", "sso-result", done);
}

fn later(w: &WebviewWindow, run: &Shared, ms: u64) {
    if let Ok(mut r) = run.lock() {
        r.timer = true;
    }
    let (w, run) = (w.clone(), run.clone());
    std::thread::spawn(move || {
        std::thread::sleep(Duration::from_millis(ms));
        step(&w, &run);
    });
}

fn step(w: &WebviewWindow, run: &Shared) {
    // asked before taking the lock: it waits for the main thread, which may be waiting for the lock
    let uri = w.url().map(|u| u.to_string()).unwrap_or_default();
    let script = {
        let Ok(mut r) = run.lock() else { return };
        r.timer = false;
        if r.done_pass || r.off || r.finished {
            return;
        }
        if !may_fill(&uri, &r.start) {
            drop(r);
            later(w, run, POLL); // not a page we trust with the password; it may redirect to one
            return;
        }
        let host = Url::parse(&uri).ok().and_then(|u| u.host_str().map(String::from)).unwrap_or_default();
        let json = |s: &str| serde_json::to_string(s).unwrap_or_default();
        let mut fill = STEP_JS.trim().to_string();
        for value in [json(&r.username), json(&r.password), r.done_user.to_string(), r.done_pass.to_string()] {
            fill = fill.replacen("%s", &value, 1);
        }
        // the page may have moved on since the check: fill in only if it is still on the host that was checked
        format!(
            "(function () {{ if ({CLICKED}) return 'off'; \
             if (location.protocol !== 'https:' || location.hostname !== {}) return ''; return {fill} }})()",
            json(&host)
        )
    };
    let (w2, run2) = (w.clone(), run.clone());
    let sent = w.eval_with_callback(script, move |out| stepped(&w2, &run2, &out));
    if sent.is_err() {
        later(w, run, POLL);
    }
}

fn stepped(w: &WebviewWindow, run: &Shared, out: &str) {
    let did: String = serde_json::from_str(out).unwrap_or_default();
    let Ok(mut r) = run.lock() else { return };
    match did.as_str() {
        "off" => r.off = true,
        "pass" => {
            r.done_pass = true;
            drop(r);
            status(w.app_handle(), run, "Password sent. Approve Duo on your phone.");
        }
        "user" => {
            r.done_user = true;
            drop(r);
            later(w, run, SETTLE); // after the username, let the password page settle before typing
        }
        _ => {
            let waiting = r.timer;
            drop(r);
            if !waiting {
                later(w, run, POLL); // no field yet: look again soon
            }
        }
    }
}

fn loaded(w: &WebviewWindow, run: &Shared, url: &Url) {
    let Ok(mut r) = run.lock() else { return };
    if r.finished {
        return;
    }
    if !r.final_url.is_empty() && url.as_str().starts_with(&r.final_url) {
        if r.reading {
            return;
        }
        r.reading = true;
        let (final_url, token_name, error_name) = (r.final_url.clone(), r.token_cookie.clone(), r.error_cookie.clone());
        drop(r);
        status(w.app_handle(), run, "Signed in. Connecting…");
        let (w, run) = (w.clone(), run.clone());
        // off the main thread: reading cookies waits for the webview (and deadlocks there on Windows)
        std::thread::spawn(move || {
            let jar = Url::parse(&final_url).map_err(|e| e.to_string())
                .and_then(|u| w.cookies_for_url(u).map_err(|e| e.to_string()));
            let (token, error) = match jar {
                Ok(jar) => {
                    let get = |name: &str| {
                        jar.iter().find(|c| c.name() == name).map(|c| c.value().to_string()).unwrap_or_default()
                    };
                    let token = get(&token_name);
                    let error = decode(&get(&error_name));
                    let error = if token.is_empty() && error.is_empty() {
                        "No sign-in token from the site".to_string()
                    } else {
                        error
                    };
                    (token, error)
                }
                Err(e) => (String::new(), e),
            };
            let error = if token.is_empty() { error } else { String::new() };
            finish(w.app_handle(), &run, token, &error);
            let _ = w.destroy();
        });
        return;
    }
    let start = !r.password.is_empty() && !r.timer && !r.done_pass;
    drop(r);
    if start {
        later(w, run, SETTLE);
    }
}

/// A navigation is about to leave the page: if you clicked a link there, stop filling in. Only web pages.
fn navigating(app: &AppHandle, run: &Shared, url: &Url) -> bool {
    if !matches!(url.scheme(), "https" | "http" | "about" | "blob" | "data") {
        return false;
    }
    let (id, active) = match run.lock() {
        Ok(r) => (r.id.clone(), !r.password.is_empty() && !r.done_pass && !r.off && !r.finished),
        Err(_) => return true,
    };
    if active {
        if let Some(w) = app.get_webview_window(&label(&id)) {
            let run = run.clone();
            let _ = w.eval_with_callback(CLICKED, move |out| {
                if out.trim() == "true" {
                    if let Ok(mut r) = run.lock() {
                        r.off = true;
                    }
                }
            });
        }
    }
    true
}

fn from_main(webview: &tauri::Webview, id: &str) -> Result<(), String> {
    if webview.label() != "main" {
        return Err("Only the main window may do this".into());
    }
    if id.is_empty() || !id.chars().all(|c| c.is_ascii_alphanumeric()) {
        return Err("Bad sign-in id".into());
    }
    Ok(())
}

/// Open the sign-in window for one "web-login" question (a second call for the same one just shows it).
#[tauri::command]
pub async fn sso_open(app: AppHandle, webview: tauri::Webview, req: SignIn) -> Result<(), String> {
    from_main(&webview, &req.id)?;
    if let Some(w) = app.get_webview_window(&label(&req.id)) {
        let _ = w.set_focus();
        return Ok(());
    }
    let url = Url::parse(&req.login_url).map_err(|e| e.to_string())?;
    if url.scheme() != "https" {
        return Err("The sign-in page is not https".into());
    }
    let (username, password) = match &req.fill {
        Some(fill) => (ask(fill, SSO_USER).unwrap_or_default(), ask(fill, SSO_PASS).unwrap_or_default()),
        None => (String::new(), String::new()),
    };
    let run: Shared = Arc::new(Mutex::new(Run {
        id: req.id.clone(),
        start: req.login_url.clone(),
        final_url: req.final_url,
        token_cookie: req.token_cookie,
        error_cookie: req.error_cookie,
        username,
        password,
        ..Run::default()
    }));
    let (nav_app, nav_run, load_run) = (app.clone(), run.clone(), run.clone());
    #[allow(unused_mut)]
    let mut builder = WebviewWindowBuilder::new(&app, label(&req.id), WebviewUrl::External(url))
        .title(&req.title)
        .inner_size(560.0, 780.0)
        .initialization_script(CLICKS_JS)
        .on_navigation(move |url| navigating(&nav_app, &nav_run, url))
        .on_page_load(move |w, p| {
            if p.event() == PageLoadEvent::Finished {
                loaded(&w, &load_run, p.url());
            }
        });
    #[cfg(not(target_os = "macos"))]
    if let Ok(dir) = app.path().app_local_data_dir() {
        // its own cookies, kept between runs, so Okta or Microsoft can remember you like a browser does
        builder = builder.data_directory(dir.join("sign-in"));
    }
    let w = builder.build().map_err(|e| e.to_string())?;
    let (close_app, close_run) = (app.clone(), run.clone());
    w.on_window_event(move |e| {
        if matches!(e, WindowEvent::Destroyed) {
            finish(&close_app, &close_run, String::new(), "Sign-in cancelled");
        }
    });
    Ok(())
}

#[tauri::command]
pub fn sso_show(app: AppHandle, webview: tauri::Webview, id: String) -> Result<(), String> {
    from_main(&webview, &id)?;
    if let Some(w) = app.get_webview_window(&label(&id)) {
        let _ = w.unminimize();
        let _ = w.set_focus();
    }
    Ok(())
}

/// Close the window (the question was cancelled or answered elsewhere).
#[tauri::command]
pub fn sso_close(app: AppHandle, webview: tauri::Webview, id: String) -> Result<(), String> {
    from_main(&webview, &id)?;
    if let Some(w) = app.get_webview_window(&label(&id)) {
        let _ = w.destroy();
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    /// A stand-in for the backend's askpass server on 127.0.0.1 (Windows): answers one line, if the token fits.
    fn askpass_on_loopback(token: &'static str, answer: &'static str) -> String {
        let listener = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
        let port = listener.local_addr().unwrap().port();
        std::thread::spawn(move || {
            for conn in listener.incoming().take(3) {
                let mut conn = conn.unwrap();
                let mut line = String::new();
                BufReader::new(conn.try_clone().unwrap()).read_line(&mut line).unwrap();
                let req: serde_json::Value = serde_json::from_str(&line).unwrap();
                let ok = req["token"] == token;
                let reply = serde_json::json!({"ok": ok, "answer": if ok { answer } else { "" }});
                conn.write_all(format!("{reply}\n").as_bytes()).unwrap();
            }
        });
        format!("tcp:127.0.0.1:{port}")
    }

    #[test]
    fn asks_over_loopback() {
        let socket = askpass_on_loopback("t0", "s3cret");
        let fill = |token: &str| Fill { socket: socket.clone(), token: token.into() };
        assert_eq!(ask(&fill("t0"), SSO_PASS).as_deref(), Some("s3cret"));
        assert_eq!(ask(&fill("guess"), SSO_PASS), None);
        let away = Fill { socket: "tcp:192.0.2.1:9".into(), token: "t0".into() };
        assert_eq!(ask(&away, SSO_PASS), None, "never sends the token off this computer");
        let junk = Fill { socket: "tcp:not-an-address".into(), token: "t0".into() };
        assert_eq!(ask(&junk, SSO_PASS), None);
    }

    #[test]
    fn password_only_goes_to_the_sign_in_site() {
        // the same cases as tests/connect/test_vpn_sso.py
        let start = "https://vpn.uni.edu/+CSCOE+/saml/sp/login?tgname=x";
        assert_eq!(site("vpn.uni.edu"), "uni.edu");
        assert_eq!(site("vpn.ox.ac.uk"), "ox.ac.uk");
        assert!(may_fill("https://idp.uni.edu/login", start));
        assert!(may_fill("https://login.microsoftonline.com/abc/saml2", start));
        assert!(!may_fill("http://idp.uni.edu/login", start));
        assert!(!may_fill("https://uni.edu.evil.example/login", start));
        assert!(!may_fill("https://evil.example/?next=uni.edu", start));
        assert!(may_fill("https://uni.okta.com/app/saml", start));
        assert!(!may_fill("https://attacker.okta.com/app/saml", start));
        assert!(!may_fill("not a url", start));
        assert!(!may_fill("https://idp.uni.edu/login", "about:blank"));
    }

    #[test]
    fn error_cookie_is_unescaped() {
        assert_eq!(decode("Account%20locked%21"), "Account locked!");
        assert_eq!(decode("50%"), "50%");
        assert_eq!(decode("%zz"), "%zz");
    }
}
