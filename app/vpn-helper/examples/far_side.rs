//! The far side of the tunnel (src/tunnel_proxy/far_side.rs) on stdin and stdout: each packet as a 2-byte
//! length (big-endian) and its bytes. For tests/connect/test_vpn_local.py's make-believe VPN server.

#[path = "../src/tunnel_proxy/far_side.rs"]
mod far_side;

use std::io::{Read, Write};
use std::sync::atomic::AtomicBool;
use std::sync::mpsc::{self, Receiver};
use std::sync::{Arc, Mutex};
use std::time::Duration;

struct Stdio(Receiver<Vec<u8>>, Mutex<std::io::Stdout>);

impl far_side::Wire for Stdio {
    fn take(&self) -> Vec<Vec<u8>> {
        let mut out: Vec<Vec<u8>> = Vec::new();
        if let Ok(p) = self.0.recv_timeout(Duration::from_millis(5)) {
            out.push(p);
        }
        out.extend(self.0.try_iter());
        out
    }
    fn put(&self, packet: &[u8]) {
        let mut o = self.1.lock().unwrap();
        let _ = o.write_all(&(packet.len() as u16).to_be_bytes());
        let _ = o.write_all(packet);
        let _ = o.flush();
    }
}

fn main() {
    let (tx, rx) = mpsc::channel();
    std::thread::spawn(move || {
        let mut i = std::io::stdin().lock();
        let mut len = [0; 2];
        while i.read_exact(&mut len).is_ok() {
            let mut p = vec![0; u16::from_be_bytes(len) as usize];
            if i.read_exact(&mut p).is_err() || tx.send(p).is_err() {
                break;
            }
        }
        std::process::exit(0); // the server went away
    });
    far_side::run(&Stdio(rx, Mutex::new(std::io::stdout())), Arc::new(AtomicBool::new(false)));
}
