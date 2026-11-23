//! When the window's web process dies, the window comes back instead of staying blank. The page inside the window
//! runs in a process of its own (WebKit on Linux, WebView2 on Windows), and a bug in it, such as the AppImage WebKit's
//! abort on some color emoji (fonts.rs), or running out of memory, ends that process. HPC Hub itself, the backend,
//! the connections and everything on the clusters keep running, so the page is just loaded again and says so.
//! When it dies again and again (MAX in WITHIN), a short page says so with Try again, instead of a loop.
//! macOS: Tauri already reloads there (tauri-runtime-wry's web content process terminate handler).

use std::sync::Mutex;
use std::time::{Duration, Instant};

/// Reloads allowed in WITHIN; one more and the window shows the short page instead.
pub const MAX: usize = 3;
pub const WITHIN: Duration = Duration::from_secs(60);

#[derive(Debug, PartialEq, Eq)]
pub enum Next {
    Reload,
    GiveUp,
}

/// The window's crashes, and whether the page loaded again hasn't been told yet.
#[derive(Default)]
pub struct Crashes {
    times: Vec<Instant>,
    untold: bool,
}

impl Crashes {
    /// The web process died at now: load the page again, or stop when it keeps dying.
    pub fn crashed(&mut self, now: Instant) -> Next {
        self.times.retain(|t| now.duration_since(*t) < WITHIN);
        self.times.push(now);
        self.untold = true;
        if self.times.len() > MAX { Next::GiveUp } else { Next::Reload }
    }

    /// True once after each crash: the page, loaded again, says the window restarted.
    pub fn take_untold(&mut self) -> bool {
        std::mem::take(&mut self.untold)
    }
}

pub type State = Mutex<Crashes>;

/// Asked by the page when it starts: did the window just come back from a crash?
#[tauri::command]
pub fn window_restarted(state: tauri::State<'_, State>) -> bool {
    state.lock().map(|mut c| c.take_untold()).unwrap_or(false)
}

fn html(s: &str) -> String {
    s.replace('&', "&amp;").replace('<', "&lt;").replace('>', "&gt;").replace('"', "&quot;")
}

/// The page shown when the window keeps stopping: what happened, that work goes on, and Try again (the app's url).
pub fn stopped_page(url: &str) -> String {
    format!(r#"<!doctype html><html><head><meta charset="utf-8"><title>HPC Hub</title><style>
:root {{ color-scheme: light dark; --bg: #fafafa; --text: #1f1f1f; --soft: #5e5e5e; --button: #1c71d8; }}
@media (prefers-color-scheme: dark) {{ :root {{ --bg: #1e1e1e; --text: #f0f0f0; --soft: #b0b0b0; --button: #78aeed; }} }}
body {{ margin: 0; min-height: 100vh; display: grid; place-items: center; background: var(--bg); color: var(--text);
  font: 15px/1.5 system-ui, sans-serif; }}
main {{ max-width: 460px; padding: 24px; }}
h1 {{ font-size: 20px; margin: 0 0 8px; }}
p {{ color: var(--soft); margin: 0 0 16px; }}
a {{ display: inline-block; padding: 8px 16px; border-radius: 6px; background: var(--button); color: var(--bg);
  font-weight: 600; text-decoration: none; }}
</style></head><body><main>
<h1>HPC Hub's window keeps stopping</h1>
<p>The part that draws this window stopped several times in a minute, so HPC Hub stopped loading it. Your cluster
connections, jobs and terminals are still running.</p>
<p>If it keeps happening, quit HPC Hub and open it again.</p>
<a href="{}">Try again</a>
</main></body></html>"#, html(url))
}

/// From now on, the main window comes back after its web process dies.
pub fn watch(app: &tauri::App) {
    use tauri::Manager;
    app.manage(State::default());
    let Some(w) = app.get_webview_window("main") else { return };
    let url = w.url().map(|u| u.to_string()).unwrap_or_default();
    let handle = app.handle().clone();
    let next = move || {
        let state = handle.state::<State>();
        let next = state.lock().map(|mut c| c.crashed(Instant::now())).unwrap_or(Next::GiveUp);
        eprintln!("HPC Hub: the window's web process stopped; {next:?}");
        next
    };
    #[cfg(target_os = "linux")]
    let _ = w.with_webview(move |pw| {
        use webkit2gtk::{WebProcessTerminationReason, WebViewExt};
        pw.inner().connect_web_process_terminated(move |view, reason| {
            if matches!(reason, WebProcessTerminationReason::TerminatedByApi) {
                return; // ended on purpose, not a crash
            }
            match next() {
                Next::Reload => view.reload(),
                Next::GiveUp => view.load_alternate_html(&stopped_page(&url), &url, None),
            }
        });
    });
    #[cfg(windows)]
    let _ = w.with_webview(move |pw| unsafe {
        use webview2_com::Microsoft::Web::WebView2::Win32::{
            COREWEBVIEW2_PROCESS_FAILED_KIND, COREWEBVIEW2_PROCESS_FAILED_KIND_RENDER_PROCESS_EXITED,
        };
        use webview2_com::ProcessFailedEventHandler;
        let Ok(core) = pw.controller().CoreWebView2() else { return };
        let mut token = 0;
        let _ = core.add_ProcessFailed(&ProcessFailedEventHandler::create(Box::new(move |sender, args| {
            let (Some(view), Some(args)) = (sender, args) else { return Ok(()) };
            let mut kind = COREWEBVIEW2_PROCESS_FAILED_KIND::default();
            args.ProcessFailedKind(&mut kind)?;
            // the page's own process; when WebView2 itself is gone there is nothing left to load into
            if kind != COREWEBVIEW2_PROCESS_FAILED_KIND_RENDER_PROCESS_EXITED {
                return Ok(());
            }
            match next() {
                Next::Reload => view.Reload(),
                Next::GiveUp => view.NavigateToString(&windows_core::HSTRING::from(stopped_page(&url))),
            }
        })), &mut token);
    });
    #[cfg(not(any(target_os = "linux", windows)))]
    let _ = (w, next);
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_crash_now_and_then_reloads_the_page() {
        let (mut c, t) = (Crashes::default(), Instant::now());
        assert_eq!(c.crashed(t), Next::Reload);
        assert_eq!(c.crashed(t + WITHIN), Next::Reload); // the first one is a minute ago
        assert_eq!(c.crashed(t + WITHIN * 3), Next::Reload);
    }

    #[test]
    fn crashing_again_and_again_stops_on_a_page_that_says_so() {
        let (mut c, t) = (Crashes::default(), Instant::now());
        for i in 0..MAX {
            assert_eq!(c.crashed(t + Duration::from_secs(i as u64)), Next::Reload);
        }
        assert_eq!(c.crashed(t + Duration::from_secs(10)), Next::GiveUp);
        assert_eq!(c.crashed(t + Duration::from_secs(11)), Next::GiveUp);
        assert_eq!(c.crashed(t + Duration::from_secs(11) + WITHIN), Next::Reload); // a minute quiet: try again
    }

    #[test]
    fn the_page_loaded_again_hears_about_it_once() {
        let mut c = Crashes::default();
        assert!(!c.take_untold());
        c.crashed(Instant::now());
        assert!(c.take_untold() && !c.take_untold());
    }

    #[test]
    fn the_stopped_page_says_work_goes_on_and_links_back() {
        let page = stopped_page("tauri://localhost/?a=1&b=\"2\"");
        assert!(page.contains("still running") && page.contains(">Try again</a>"));
        assert!(page.contains(r#"href="tauri://localhost/?a=1&amp;b=&quot;2&quot;""#));
        assert!(page.contains("prefers-color-scheme: dark") && !page.contains("<script"));
    }
}
