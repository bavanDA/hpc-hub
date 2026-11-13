//! The tunnels: each one openconnect as a child process, with its state (down/connecting/up) and its last 30
//! lines. Several run side by side, one per name (the app uses the cluster's id).

use std::collections::{BTreeMap, VecDeque};
use std::io::{BufRead, BufReader, Read, Write};
use std::path::PathBuf;
use std::process::{Child, Command, Stdio};
use std::sync::mpsc::{self, Sender};
use std::sync::{Arc, Mutex, MutexGuard};
use std::thread;
use std::time::{Duration, Instant};

use crate::dns;
use crate::openconnect;
use crate::protocol::Up;

const LOG_LINES: usize = 30;
const LINE_MAX: usize = 500; // chars kept of one output line
const POLITE: Duration = Duration::from_secs(5); // from the polite stop to the kill
pub const MAX_TUNNELS: usize = 8; // running at once

#[derive(Clone, Copy, PartialEq, Debug, Default)]
pub enum State {
    #[default]
    Down,
    Connecting,
    Up,
}

impl State {
    pub fn name(self) -> &'static str {
        match self {
            State::Down => "down",
            State::Connecting => "connecting",
            State::Up => "up",
        }
    }
}

pub struct Status {
    pub state: State,
    pub gateway: String,
    pub error: String,
    pub log: Vec<String>,
}

struct Run {
    id: u64,
    child: Child,
    exited: bool,  // reaped: its pid may be reused, so no more signals
    stopping: bool, // we asked it to stop: not an error
}

#[derive(Default)]
struct Inner {
    state: State,
    gateway: String,
    error: String,
    log: VecDeque<String>,
    last_err: String,
    run_id: u64,
    run: Option<Run>,
}

pub struct Tunnel {
    dir: PathBuf,
    name: String,
    inner: Arc<Mutex<Inner>>,
    ops: Mutex<()>, // one up/down at a time
}

fn lock(m: &Mutex<Inner>) -> MutexGuard<'_, Inner> {
    m.lock().unwrap_or_else(|e| e.into_inner())
}

impl Tunnel {
    /// `dir` is the install folder; openconnect runs from `<dir>/openconnect`. `name` is checked by the caller.
    pub fn new(dir: PathBuf, name: String) -> Self {
        Tunnel { dir, name, inner: Arc::default(), ops: Mutex::new(()) }
    }

    pub fn status(&self) -> Status {
        let i = lock(&self.inner);
        Status { state: i.state, gateway: i.gateway.clone(), error: i.error.clone(), log: i.log.iter().cloned().collect() }
    }

    /// Start openconnect for a checked request (stopping the one running first). Ok once it has started.
    pub fn up(&self, up: &Up, host: String) -> Result<(), String> {
        let _op = self.ops.lock().unwrap_or_else(|e| e.into_inner());
        self.stop();
        let folder = openconnect::folder(&self.dir);
        let script = openconnect::script_arg(&openconnect::wrapper(&self.dir).to_string_lossy(), cfg!(windows))?;
        let mut cmd = Command::new(openconnect::program(&self.dir));
        cmd.args(openconnect::args(up, &script))
            .envs(openconnect::env(up))
            .current_dir(&folder)
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped());
        platform::prepare(&mut cmd);

        let mut i = lock(&self.inner);
        i.run_id += 1;
        let id = i.run_id;
        i.state = State::Connecting;
        i.gateway = host;
        i.error.clear();
        i.last_err.clear();
        i.log.clear();
        let mut child = match cmd.spawn() {
            Ok(c) => c,
            Err(e) => {
                i.state = State::Down;
                i.error = format!("Could not start openconnect: {e}");
                return Err(i.error.clone());
            }
        };
        let (stdin, stdout, stderr) = (child.stdin.take(), child.stdout.take(), child.stderr.take());
        i.run = Some(Run { id, child, exited: false, stopping: false });
        drop(i);

        // The cookie on stdin, then stdin closed. A thread, so a child that never reads can't block us.
        let cookie = up.cookie.clone();
        thread::spawn(move || {
            if let Some(mut s) = stdin {
                let _ = s.write_all(format!("{cookie}\n").as_bytes());
            }
        });
        let (done, readers) = mpsc::channel();
        for (stream, is_err) in [(stdout.map(|s| Box::new(s) as Box<dyn Read + Send>), false),
                                 (stderr.map(|s| Box::new(s) as Box<dyn Read + Send>), true)] {
            if let Some(stream) = stream {
                let (inner, cookie, done) = (self.inner.clone(), up.cookie.clone(), done.clone());
                thread::spawn(move || read_lines(&inner, id, stream, is_err, &cookie, done));
            }
        }
        drop(done);
        let (inner, name) = (self.inner.clone(), self.name.clone());
        thread::spawn(move || watch(&inner, id, readers, &name));
        Ok(())
    }

    /// Stop the tunnel, if any. Returns once openconnect has exited.
    pub fn down(&self) {
        let _op = self.ops.lock().unwrap_or_else(|e| e.into_inner());
        self.stop();
    }

    /// Polite stop, then kill after 5 s. The caller holds `ops`.
    fn stop(&self) {
        let id = {
            let mut i = lock(&self.inner);
            let Some(run) = i.run.as_mut() else { return };
            if !run.exited {
                run.stopping = true;
                if !platform::interrupt(&run.child) {
                    let _ = run.child.kill();
                }
            }
            run.id
        };
        if self.wait_gone(id, POLITE) {
            return;
        }
        if let Some(run) = lock(&self.inner).run.as_mut().filter(|r| r.id == id && !r.exited) {
            let _ = run.child.kill();
        }
        self.wait_gone(id, Duration::from_secs(10));
    }

    fn wait_gone(&self, id: u64, within: Duration) -> bool {
        let end = Instant::now() + within;
        loop {
            if !lock(&self.inner).run.as_ref().is_some_and(|r| r.id == id) {
                return true;
            }
            if Instant::now() >= end {
                return false;
            }
            thread::sleep(Duration::from_millis(50));
        }
    }
}

/// One output line as it goes in the log: no cookie, no line end, not too long.
fn clean(raw: &[u8], cookie: &str) -> String {
    let mut line = String::from_utf8_lossy(raw).trim_end_matches(['\r', '\n']).to_string();
    if !cookie.is_empty() && line.contains(cookie) {
        line = line.replace(cookie, "***");
    }
    match line.char_indices().nth(LINE_MAX) {
        Some((at, _)) => line[..at].to_string(),
        None => line,
    }
}

fn read_lines(inner: &Mutex<Inner>, id: u64, stream: Box<dyn Read + Send>, is_err: bool, cookie: &str, done: Sender<()>) {
    let mut r = BufReader::new(stream);
    let mut buf = Vec::new();
    loop {
        buf.clear();
        match r.read_until(b'\n', &mut buf) {
            Ok(0) | Err(_) => break,
            Ok(_) => {}
        }
        let line = clean(&buf, cookie);
        if line.trim().is_empty() {
            continue;
        }
        let mut i = lock(inner);
        if i.run_id != id {
            continue; // an older run still draining
        }
        if line.starts_with("Configured as")
            && i.state == State::Connecting
            && i.run.as_ref().is_some_and(|r| r.id == id)
        {
            i.state = State::Up;
        }
        if is_err {
            i.last_err = line.clone();
        }
        if i.log.len() >= LOG_LINES {
            i.log.pop_front();
        }
        i.log.push_back(line);
    }
    let _ = done.send(());
}

/// Waits for openconnect to exit, then marks the tunnel down (with its last error line unless we stopped it).
/// Its split DNS goes first, so a new `up` (which waits for this) never has its fresh rules removed.
fn watch(inner: &Mutex<Inner>, id: u64, readers: mpsc::Receiver<()>, name: &str) {
    let how = loop {
        thread::sleep(Duration::from_millis(100));
        let mut i = lock(inner);
        let Some(run) = i.run.as_mut().filter(|r| r.id == id) else { return };
        match run.child.try_wait() {
            Ok(Some(status)) => {
                run.exited = true;
                break status.to_string();
            }
            Ok(None) => {}
            Err(e) => {
                run.exited = true;
                break e.to_string();
            }
        }
    };
    // The readers end at EOF; wait a little for them so the last lines are in.
    let end = Instant::now() + Duration::from_secs(3);
    while readers.recv_timeout(end.saturating_duration_since(Instant::now())).is_ok() {}
    dns::forget(Some(name));
    let mut i = lock(inner);
    let Some(run) = i.run.take_if(|r| r.id == id) else { return };
    i.state = State::Down;
    i.error = if run.stopping {
        String::new()
    } else if !i.last_err.is_empty() {
        i.last_err.clone()
    } else {
        i.log.back().cloned().unwrap_or_else(|| format!("openconnect stopped ({how})"))
    };
}

/// Every tunnel by name. A name's tunnel stays after it stops, so `status` still tells why; stopped ones make
/// room when a new name would go over MAX_TUNNELS.
pub struct Tunnels {
    dir: PathBuf,
    all: Mutex<BTreeMap<String, Arc<Tunnel>>>,
}

impl Tunnels {
    pub fn new(dir: PathBuf) -> Self {
        Tunnels { dir, all: Mutex::default() }
    }

    fn get(&self, name: &str) -> Option<Arc<Tunnel>> {
        self.all.lock().unwrap_or_else(|e| e.into_inner()).get(name).cloned()
    }

    /// The named tunnel's status; one never started is down.
    pub fn status(&self, name: &str) -> Status {
        match self.get(name) {
            Some(t) => t.status(),
            None => Status { state: State::Down, gateway: String::new(), error: String::new(), log: Vec::new() },
        }
    }

    /// Start (or restart) the named tunnel, beside the others.
    pub fn up(&self, name: &str, up: &Up, host: String) -> Result<(), String> {
        let tunnel = {
            let mut all = self.all.lock().unwrap_or_else(|e| e.into_inner());
            if !all.contains_key(name) {
                if all.len() >= MAX_TUNNELS {
                    all.retain(|_, t| t.status().state != State::Down);
                }
                if all.len() >= MAX_TUNNELS {
                    return Err(format!("{MAX_TUNNELS} VPNs are already on: disconnect one first"));
                }
                all.insert(name.to_string(), Arc::new(Tunnel::new(self.dir.clone(), name.to_string())));
            }
            all[name].clone()
        };
        tunnel.up(up, host)
    }

    /// Stop the named tunnel, if any. Returns once its openconnect has exited.
    pub fn down(&self, name: &str) {
        if let Some(t) = self.get(name) {
            t.down();
        }
    }

    /// Stop them all, side by side (the helper is stopping).
    pub fn down_all(&self) {
        let all: Vec<Arc<Tunnel>> = self.all.lock().unwrap_or_else(|e| e.into_inner()).values().cloned().collect();
        thread::scope(|s| {
            for t in &all {
                s.spawn(|| t.down());
            }
        });
    }
}

#[cfg(unix)]
mod platform {
    use std::os::unix::process::CommandExt;
    use std::process::{Child, Command};

    /// serve blocks SIGTERM/SIGINT/SIGHUP (to sigwait for them); openconnect gets them unblocked.
    pub fn prepare(cmd: &mut Command) {
        let unblock = || {
            let mut set: libc::sigset_t = unsafe { std::mem::zeroed() };
            unsafe {
                libc::sigemptyset(&mut set);
                libc::pthread_sigmask(libc::SIG_SETMASK, &set, std::ptr::null_mut());
            }
            Ok(())
        };
        unsafe { cmd.pre_exec(unblock) };
    }

    /// SIGINT: openconnect logs out and runs vpnc-script, which removes the routes and DNS.
    pub fn interrupt(child: &Child) -> bool {
        let Ok(pid) = libc::pid_t::try_from(child.id()) else { return false };
        unsafe { libc::kill(pid, libc::SIGINT) == 0 }
    }
}

// Windows stop: openconnect.exe handles console control events with SetConsoleCtrlHandler (Ctrl+C: cancel and
// log out, Ctrl+Break: detach; both shut the tunnel down and run the script's "disconnect"). Ctrl+C can only
// go to a whole console, so we start openconnect in its own process group on our console (serve allocates one
// when it runs as a service) and send Ctrl+Break to just that group. If that fails, TerminateProcess.
#[cfg(windows)]
mod platform {
    use std::os::windows::process::CommandExt;
    use std::process::{Child, Command};

    use windows_sys::Win32::System::Console::{CTRL_BREAK_EVENT, GenerateConsoleCtrlEvent};
    use windows_sys::Win32::System::Threading::CREATE_NEW_PROCESS_GROUP;

    pub fn prepare(cmd: &mut Command) {
        cmd.creation_flags(CREATE_NEW_PROCESS_GROUP);
    }

    pub fn interrupt(child: &Child) -> bool {
        unsafe { GenerateConsoleCtrlEvent(CTRL_BREAK_EVENT, child.id()) != 0 }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn clean_lines() {
        assert_eq!(clean(b"hello\r\n", "c"), "hello");
        assert_eq!(clean(b"cookie is webvpn=s3cret!\n", "webvpn=s3cret"), "cookie is ***!");
        assert_eq!(clean(&[b'x'; 2000], "c").len(), LINE_MAX);
        assert_eq!(clean("é".repeat(600).as_bytes(), "c").chars().count(), LINE_MAX);
        assert_eq!(clean(b"\xff ok", "c"), "\u{fffd} ok");
    }

    #[test]
    fn state_names() {
        assert_eq!(State::Down.name(), "down");
        assert_eq!(State::Connecting.name(), "connecting");
        assert_eq!(State::Up.name(), "up");
    }
}
