//! Terminals: one real PTY per open terminal (ConPTY on Windows), running a local command, usually ssh riding
//! the cluster's ControlMaster (the argv comes from `terminals.command` in the Python backend). Output goes to
//! the UI as "pty-data" events {id, data} with data in base64 (a read can end inside a UTF-8 character), and
//! the end as "pty-exit" {id, code}.

use std::collections::HashMap;
use std::io::{ErrorKind, Read, Write};
use std::sync::atomic::{AtomicU32, Ordering};
use std::sync::mpsc::{self, Sender};
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

/// The open PTYs by id.
#[derive(Default)]
pub struct Ptys {
    open: Arc<Mutex<HashMap<u32, Pty>>>,
    next: AtomicU32,
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
        std::thread::spawn(move || {
            let mut buf = [0u8; 16384];
            loop {
                match reader.read(&mut buf) {
                    Ok(0) => break,
                    Ok(n) => on_data(id, &buf[..n]),
                    Err(e) if e.kind() == ErrorKind::Interrupted => continue,
                    Err(_) => break, // Linux says EIO once the child side is gone
                }
            }
            on_exit(id, code_rx.recv().unwrap_or(1));
        });
        Ok(id)
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
    if !ssh_only(&argv) {
        return Err("Terminals only run ssh".into());
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
}
