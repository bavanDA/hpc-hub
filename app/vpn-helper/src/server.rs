//! What `serve` does with one connection, whatever carries it (Unix socket or named pipe).

use std::io::{BufRead, BufReader, Read, Write};

use serde_json::{Value, json};

use crate::config::Config;
use crate::protocol::{self, MAX_LINE, Request, VERSION, ok, refuse};
use crate::tunnel::Tunnel;

pub struct Server {
    pub config: Config,
    pub tunnel: Tunnel,
}

impl Server {
    /// The answer to one request line from `caller` (a uid or SID; None: unknown).
    pub fn handle(&self, caller: Option<&str>, line: &str) -> Value {
        if !caller.is_some_and(|c| self.config.allows(c)) {
            return refuse("Not allowed: the VPN helper was set up for another account");
        }
        let request = match protocol::parse(line) {
            Ok(r) => r,
            Err(e) => return refuse(e),
        };
        match request {
            Request::Version => json!({"ok": true, "version": VERSION}),
            Request::Status => {
                let s = self.tunnel.status();
                json!({"ok": true, "state": s.state.name(), "gateway": s.gateway, "error": s.error, "log": s.log})
            }
            Request::Up(up) => match protocol::check_up(&up, &self.config.gateways) {
                Ok(host) => match self.tunnel.up(&up, host) {
                    Ok(()) => ok(),
                    Err(e) => refuse(e),
                },
                Err(e) => refuse(e),
            },
            Request::Down => {
                self.tunnel.down();
                ok()
            }
        }
    }

    /// Read one line from the connection, write one answer line.
    pub fn answer(&self, caller: Option<&str>, conn: impl Read + Write) {
        let mut reader = BufReader::new(conn);
        let mut line = Vec::new();
        let answer = match reader.by_ref().take(MAX_LINE).read_until(b'\n', &mut line) {
            Err(_) | Ok(0) => return,
            Ok(_) if !line.ends_with(b"\n") && line.len() as u64 >= MAX_LINE => refuse("Request too long"),
            Ok(_) => match std::str::from_utf8(&line) {
                Ok(text) => self.handle(caller, text),
                Err(_) => refuse("Bad request"),
            },
        };
        let mut conn = reader.into_inner();
        let _ = conn.write_all(format!("{answer}\n").as_bytes());
        let _ = conn.flush();
    }
}
