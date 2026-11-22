//! Terminals: one real PTY per open terminal (ConPTY on Windows), running a local command, usually ssh riding
//! the cluster's ControlMaster (the argv comes from `terminals.command` in the Python backend). Output goes to
//! the UI as "pty-data" events {id, data} with data in base64 (a read can end inside a UTF-8 character), and
//! the end as "pty-exit" {id, code}.
//!
//! Only an argv the backend made can start: it tells the window each one on its own output ("pty-argv" events,
//! read by backend.rs, never passed to the page), and pty_open refuses any other. A page can't put together
//! `ssh -oProxyCommand=...` or run a file it named ssh. Output is sent in batches (BATCH, BATCH_BYTES), not one
//! event per read, so a command printing fast doesn't flood the window with events.

use std::collections::{HashMap, VecDeque};
use std::io::{ErrorKind, Read, Write};
use std::sync::atomic::{AtomicU32, Ordering};
use std::sync::mpsc::{self, Receiver, RecvTimeoutError, Sender};
use std::time::{Duration, Instant};
use std::sync::{Arc, Mutex};

use base64::Engine;
use base64::engine::general_purpose::STANDARD;
use portable_pty::{ChildKiller, CommandBuilder, MasterPty, PtySize, native_pty_system};
use serde::Serialize;
use tauri::{AppHandle, Emitter, State};

struct Pty {
    master: Box<dyn MasterPty + Send>,
    input: Sender<Vec<u8>>,
    killer: Box<dyn ChildKiller + Send + Sync>,
}

/// The open PTYs by id, and the argv the backend made lately (the only ones that may start).
#[derive(Default)]
pub struct Ptys {
    open: Arc<Mutex<HashMap<u32, Pty>>>,
    next: AtomicU32,
    made: Mutex<VecDeque<Vec<String>>>,
}

/// Output that comes soon after the last batch waits up to this long for more, so a command printing fast is
/// one event per BATCH (or per BATCH_BYTES), not one per read. Output after a quiet moment (an echoed key) goes
/// at once.
const BATCH: Duration = Duration::from_millis(10);
const BATCH_BYTES: usize = 64 * 1024;

/// Sends what comes on chunks in batches until the sender is gone; everything, in order.
pub fn batches(chunks: Receiver<Vec<u8>>, window: Duration, most: usize, mut send: impl FnMut(&[u8])) {
    let mut buf: Vec<u8> = Vec::new();
    let mut last: Option<Instant> = None;
    while let Ok(first) = chunks.recv() {
        buf.extend_from_slice(&first);
        while buf.len() < most {
            match chunks.try_recv() {
                Ok(more) => buf.extend_from_slice(&more),
                Err(_) => break,
            }
        }
        let mut gone = false;
        if let Some(deadline) = last.map(|t| t + window).filter(|d| *d > Instant::now()) {
            // soon after the last batch: wait out the window for more
            while buf.len() < most {
                let Some(left) = deadline.checked_duration_since(Instant::now()) else { break };
                match chunks.recv_timeout(left) {
                    Ok(more) => buf.extend_from_slice(&more),
                    Err(RecvTimeoutError::Timeout) => break,
                    Err(RecvTimeoutError::Disconnected) => {
                        gone = true;
                        break;
                    }
                }
            }
        }
        send(&buf);
        buf.clear();
        last = Some(Instant::now());
        if gone {
            return;
        }
    }
}

/// How many of the backend's argv are kept: a tab starts its own within a second, a log tab may open again later.
const MADE: usize = 64;

/// The argv in one line of the backend's output, when it is a "pty-argv" event (the backend made it).
pub fn made_argv(line: &str) -> Option<Vec<String>> {
    if !line.contains("\"pty-argv\"") {
        return None; // most lines: no JSON parse
    }
    let v: serde_json::Value = serde_json::from_str(line).ok()?;
    if v.get("method")?.as_str()? != "event" || v.get("id").is_some() {
        return None;
    }
    let params = v.get("params")?;
    if params.get("name")?.as_str()? != "pty-argv" {
        return None;
    }
    params.get("data")?.get("argv")?.as_array()?.iter().map(|a| a.as_str().map(String::from)).collect()
}

fn size(cols: u16, rows: u16) -> PtySize {
    PtySize { rows: rows.max(1), cols: cols.max(1), pixel_width: 0, pixel_height: 0 }
}

impl Ptys {
    /// Start argv in a new PTY. on_data gets its output as it comes, then on_exit its exit code, once.
    pub fn open(
        &self,
        argv: &[String],
        cols: u16,
        rows: u16,
        mut on_data: impl FnMut(u32, &[u8]) + Send + 'static,
        on_exit: impl FnOnce(u32, u32) + Send + 'static,
    ) -> Result<u32, String> {
        let (program, args) = argv.split_first().ok_or("Nothing to run")?;
        let pair = native_pty_system().openpty(size(cols, rows)).map_err(|e| e.to_string())?;
        let mut cmd = CommandBuilder::new(program);
        cmd.args(args);
        // this computer's libraries, not the AppImage's (ssh with the AppImage's OpenSSL refuses to start)
        if let Some(env) = crate::hostenv::host(&std::env::vars().collect::<Vec<_>>()) {
            cmd.env_clear();
            for (key, value) in env {
                cmd.env(key, value);
            }
        }
        cmd.env("TERM", "xterm-256color");
        cmd.env("COLORTERM", "truecolor");
        let mut child = pair.slave.spawn_command(cmd).map_err(|e| e.to_string())?;
        drop(pair.slave); // only the child holds it now, so its end reaches us as the end of the output
        let mut reader = pair.master.try_clone_reader().map_err(|e| e.to_string())?;
        let mut writer = pair.master.take_writer().map_err(|e| e.to_string())?;
        let id = self.next.fetch_add(1, Ordering::Relaxed) + 1;

        // Keys go through one thread per PTY: they stay in order, and a busy child never blocks the UI
        let (input, keys) = mpsc::channel::<Vec<u8>>();
        std::thread::spawn(move || {
            for chunk in keys {
                if writer.write_all(&chunk).and_then(|_| writer.flush()).is_err() {
                    break;
                }
            }
        });
        let killer = child.clone_killer();
        self.lock()?.insert(id, Pty { master: pair.master, input, killer });

        let (code_tx, code_rx) = mpsc::channel();
        let open = self.open.clone();
        std::thread::spawn(move || {
            let code = child.wait().map(|s| s.exit_code()).unwrap_or(1);
            let _ = code_tx.send(code);
            // ConPTY keeps the output open until the PTY itself is closed
            if let Ok(mut open) = open.lock() {
                open.remove(&id);
            }
        });
        let (chunk_tx, chunks) = mpsc::channel::<Vec<u8>>();
        std::thread::spawn(move || {
            let mut buf = [0u8; 16384];
            loop {
                match reader.read(&mut buf) {
                    Ok(0) => break,
                    Ok(n) => {
                        if chunk_tx.send(buf[..n].to_vec()).is_err() {
                            break;
                        }
                    }
                    Err(e) if e.kind() == ErrorKind::Interrupted => continue,
                    Err(_) => break, // Linux says EIO once the child side is gone
                }
            }
        });
        std::thread::spawn(move || {
            batches(chunks, BATCH, BATCH_BYTES, |d| on_data(id, d));
            on_exit(id, code_rx.recv().unwrap_or(1)); // after the last output
        });
        Ok(id)
    }

    /// The backend made this argv: it may start.
    pub fn allow(&self, argv: Vec<String>) {
        if let Ok(mut made) = self.made.lock() {
            made.retain(|a| a != &argv);
            made.push_back(argv);
            while made.len() > MADE {
                made.pop_front();
            }
        }
    }

    /// Made by the backend, and ssh.
    pub fn may_start(&self, argv: &[String]) -> bool {
        ssh_only(argv) && self.made.lock().map(|m| m.iter().any(|a| a == argv)).unwrap_or(false)
    }

    pub fn write(&self, id: u32, data: &[u8]) -> Result<(), String> {
        let open = self.lock()?;
        let pty = open.get(&id).ok_or("This terminal has ended")?;
        pty.input.send(data.to_vec()).map_err(|_| "This terminal has ended".to_string())
    }

    pub fn resize(&self, id: u32, cols: u16, rows: u16) -> Result<(), String> {
        match self.lock()?.get(&id) {
            Some(pty) => pty.master.resize(size(cols, rows)).map_err(|e| e.to_string()),
            None => Ok(()),
        }
    }

    /// Ends the command (for ssh into tmux: detaches, the session keeps running).
    pub fn close(&self, id: u32) -> Result<(), String> {
        if let Some(mut pty) = self.lock()?.remove(&id) {
            let _ = pty.killer.kill();
        }
        Ok(())
    }

    fn lock(&self) -> Result<std::sync::MutexGuard<'_, HashMap<u32, Pty>>, String> {
        self.open.lock().map_err(|e| e.to_string())
    }
}

#[derive(Clone, Serialize)]
struct Data {
    id: u32,
    data: String,
}

#[derive(Clone, Serialize)]
struct Exit {
    id: u32,
    code: u32,
}

/// The UI may only start ssh: even a bug in the page can't run other programs on this computer.
fn ssh_only(argv: &[String]) -> bool {
    argv.first()
        .and_then(|p| std::path::Path::new(p).file_stem())
        .is_some_and(|name| name == "ssh")
}

#[tauri::command]
pub fn pty_open(argv: Vec<String>, cols: u16, rows: u16, app: AppHandle, ptys: State<Ptys>) -> Result<u32, String> {
    if !ptys.may_start(&argv) {
        return Err("Terminals only run the ssh command HPC Hub made for them".into());
    }
    let out = app.clone();
    ptys.open(
        &argv,
        cols,
        rows,
        move |id, data| {
            let _ = out.emit("pty-data", Data { id, data: STANDARD.encode(data) });
        },
        move |id, code| {
            let _ = app.emit("pty-exit", Exit { id, code });
        },
    )
}

#[tauri::command]
pub fn pty_write(id: u32, data: String, ptys: State<Ptys>) -> Result<(), String> {
    ptys.write(id, data.as_bytes())
}

#[tauri::command]
pub fn pty_resize(id: u32, cols: u16, rows: u16, ptys: State<Ptys>) -> Result<(), String> {
    ptys.resize(id, cols, rows)
}

#[tauri::command]
pub fn pty_close(id: u32, ptys: State<Ptys>) -> Result<(), String> {
    ptys.close(id)
}

#[cfg(test)]
mod tests {

    #[test]
    fn only_ssh_may_start() {
        let v = |a: &[&str]| a.iter().map(|x| x.to_string()).collect::<Vec<_>>();
        assert!(ssh_only(&v(&["ssh", "-t", "host"])) && ssh_only(&v(&["/usr/bin/ssh"])) && ssh_only(&v(&["ssh.exe"])));
        assert!(!ssh_only(&v(&["bash", "-c", "ssh"])) && !ssh_only(&v(&["sshd"])) && !ssh_only(&[]));
    }
    use super::*;
    use std::time::{Duration, Instant};

    fn run(ptys: &Ptys, argv: &[&str]) -> (u32, Arc<Mutex<Vec<u8>>>, mpsc::Receiver<u32>) {
        let out = Arc::new(Mutex::new(Vec::new()));
        let (seen, (done, ended)) = (out.clone(), mpsc::channel());
        let argv: Vec<String> = argv.iter().map(|s| s.to_string()).collect();
        let id = ptys
            .open(&argv, 80, 24, move |_, d| seen.lock().unwrap().extend_from_slice(d), move |_, code| {
                done.send(code).unwrap()
            })
            .unwrap();
        (id, out, ended)
    }

    fn text(out: &Arc<Mutex<Vec<u8>>>) -> String {
        String::from_utf8_lossy(&out.lock().unwrap()).into_owned()
    }

    #[test]
    fn runs_a_command_and_reads_its_output() {
        let ptys = Ptys::default();
        let argv: &[&str] = if cfg!(windows) { &["cmd", "/c", "echo hi"] } else { &["sh", "-c", "echo hi"] };
        let (_, out, ended) = run(&ptys, argv);
        assert_eq!(ended.recv_timeout(Duration::from_secs(10)).unwrap(), 0);
        assert!(text(&out).contains("hi"), "got {:?}", text(&out));
    }

    #[cfg(unix)]
    #[test]
    fn types_resizes_and_closes() {
        let ptys = Ptys::default();
        let (id, out, ended) = run(&ptys, &["sh", "-c", "stty size; read line; stty size; cat"]);
        let wait_for = |want: &str| {
            let start = Instant::now();
            while !text(&out).contains(want) && start.elapsed() < Duration::from_secs(10) {
                std::thread::sleep(Duration::from_millis(20));
            }
            assert!(text(&out).contains(want), "no {want:?} in {:?}", text(&out));
        };
        wait_for("24 80");
        ptys.resize(id, 100, 30).unwrap();
        ptys.write(id, b"go\n").unwrap();
        wait_for("30 100");
        ptys.write(id, b"hello pty\n").unwrap();
        wait_for("hello pty");
        ptys.close(id).unwrap();
        ended.recv_timeout(Duration::from_secs(10)).unwrap();
        assert!(ptys.write(id, b"x").is_err());
        assert!(ptys.open(&[], 80, 24, |_, _| {}, |_, _| {}).is_err());
    }

    fn v(a: &[&str]) -> Vec<String> {
        a.iter().map(|x| x.to_string()).collect()
    }

    const MADE_LINE: &str = r#"{"jsonrpc":"2.0","method":"event","params":{"name":"pty-argv","data":{"argv":["ssh","-o","BatchMode=yes","-tt","-p","22","-l","jdoe","--","login.example.edu","tmux attach"]}}}"#;

    #[test]
    fn the_backends_pty_argv_event_is_read() {
        let argv = made_argv(MADE_LINE).unwrap();
        assert_eq!(argv[0], "ssh");
        assert_eq!(argv.last().unwrap(), "tmux attach");
        // not one: other events, replies that merely carry the words, broken lines
        assert!(made_argv(r#"{"jsonrpc":"2.0","method":"event","params":{"name":"log","data":"pty-argv"}}"#).is_none());
        assert!(made_argv(r#"{"jsonrpc":"2.0","id":7,"result":{"name":"pty-argv","argv":["ssh","-oProxyCommand=x"]}}"#).is_none());
        assert!(made_argv(r#"{"jsonrpc":"2.0","id":7,"method":"event","params":{"name":"pty-argv","data":{"argv":["ssh"]}}}"#).is_none());
        assert!(made_argv(r#"{"jsonrpc":"2.0","id":3,"result":"{\"pty-argv\"}"}"#).is_none());
        assert!(made_argv(r#"{"jsonrpc":"2.0","method":"event","params":{"name":"pty-argv","data":{"argv":["ssh",1]}}}"#).is_none());
        assert!(made_argv(r#"{"jsonrpc":"2.0","method":"event","params":{"name":"session","data":{}}}"#).is_none());
        assert!(made_argv("not json \"pty-argv\"").is_none());
    }

    #[test]
    fn only_an_argv_the_backend_made_may_start() {
        let ptys = Ptys::default();
        let made = made_argv(MADE_LINE).unwrap();
        assert!(!ptys.may_start(&made), "nothing made yet");
        ptys.allow(made.clone());
        assert!(ptys.may_start(&made));
        assert!(ptys.may_start(&made), "a log tab may open the same one again");
        let mut evil = made.clone();
        evil.insert(1, "-oProxyCommand=calc.exe".into());
        assert!(!ptys.may_start(&evil));
        assert!(!ptys.may_start(&v(&["ssh", "-oProxyCommand=sh -c id", "x"])));
        assert!(!ptys.may_start(&v(&["/tmp/ssh"])));
        ptys.allow(v(&["bash", "-c", "x"])); // even if the backend ever said so: ssh only
        assert!(!ptys.may_start(&v(&["bash", "-c", "x"])));
    }

    #[test]
    fn only_the_newest_argv_are_kept() {
        let ptys = Ptys::default();
        for n in 0..(MADE + 5) {
            ptys.allow(v(&["ssh", &format!("host{n}")]));
        }
        assert!(!ptys.may_start(&v(&["ssh", "host0"])));
        assert!(ptys.may_start(&v(&["ssh", &format!("host{}", MADE + 4)])));
        assert_eq!(ptys.made.lock().unwrap().len(), MADE);
    }

    #[test]
    fn pty_open_and_the_backend_reader_use_it() {
        let src = include_str!("pty.rs");
        let open = &src[src.find("pub fn pty_open(").unwrap()..];
        assert!(open[..open.find("ptys.open(").unwrap()].contains("ptys.may_start(&argv)"));
        let backend = include_str!("backend.rs");
        let reader = &backend[backend.find(".lines()").unwrap()..];
        let made = reader.find("made_argv(&line)").unwrap();
        assert!(made < reader.find("handle.emit(\"rpc\"").unwrap() && reader[made..].contains("ptys.allow(argv)"));
    }

    fn collect(window: Duration, most: usize, feed: impl FnOnce(Sender<Vec<u8>>) + Send + 'static)
        -> Vec<(Instant, Vec<u8>)> {
        let (tx, rx) = mpsc::channel();
        let feeder = std::thread::spawn(move || feed(tx));
        let mut got = Vec::new();
        batches(rx, window, most, |d| got.push((Instant::now(), d.to_vec())));
        feeder.join().unwrap();
        got
    }

    #[test]
    fn a_flood_of_output_is_a_few_batches_with_every_byte_in_order() {
        let got = collect(Duration::from_millis(50), 1 << 20, |tx| {
            for n in 0..2000u32 {
                tx.send(n.to_be_bytes().to_vec()).unwrap();
            }
        });
        assert!(got.len() <= 3, "{} events for 2000 reads", got.len());
        let all: Vec<u8> = got.iter().flat_map(|(_, d)| d.clone()).collect();
        assert_eq!(all, (0..2000u32).flat_map(|n| n.to_be_bytes()).collect::<Vec<_>>());
    }

    #[test]
    fn output_after_a_quiet_moment_goes_at_once() {
        // an echoed key: nobody waits for the batch window
        let start = Instant::now();
        let got = collect(Duration::from_secs(5), 1 << 20, |tx| {
            tx.send(b"a".to_vec()).unwrap();
            std::thread::sleep(Duration::from_millis(300));
        });
        assert_eq!(got.len(), 1);
        assert!(got[0].0 - start < Duration::from_millis(200), "took {:?}", got[0].0 - start);
    }

    #[test]
    fn a_batch_never_grows_past_its_size() {
        let got = collect(Duration::from_secs(5), 100, |tx| {
            for _ in 0..10 {
                tx.send(vec![7u8; 60]).unwrap();
            }
        });
        assert_eq!(got.iter().map(|(_, d)| d.len()).sum::<usize>(), 600);
        assert!(got.iter().all(|(_, d)| d.len() < 100 + 60), "{:?}", got.iter().map(|(_, d)| d.len()).collect::<Vec<_>>());
        assert!(got.len() >= 4);
    }

    #[test]
    fn what_comes_soon_after_a_batch_waits_for_more() {
        let got = collect(Duration::from_millis(200), 1 << 20, |tx| {
            tx.send(b"1".to_vec()).unwrap();
            std::thread::sleep(Duration::from_millis(20));
            tx.send(b"2".to_vec()).unwrap();
            std::thread::sleep(Duration::from_millis(20));
            tx.send(b"3".to_vec()).unwrap();
        });
        assert_eq!(got.iter().map(|(_, d)| d.clone()).collect::<Vec<_>>(), vec![b"1".to_vec(), b"23".to_vec()]);
    }
}
