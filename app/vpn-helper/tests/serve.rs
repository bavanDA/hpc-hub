//! `serve` end to end on Linux, with a fake openconnect (a shell script) in the install folder.
#![cfg(target_os = "linux")]

use std::fs;
use std::io::{BufRead, BufReader, Write};
use std::os::unix::fs::PermissionsExt;
use std::os::unix::net::UnixStream;
use std::path::{Path, PathBuf};
use std::process::{Child, Command};
use std::thread::sleep;
use std::time::{Duration, Instant};

use serde_json::{Value, json};

const FAKE_OPENCONNECT: &str = r#"#!/bin/sh
echo $$ > "$(dirname "$0")/pid"
read cookie
if read more; then echo "stdin still open"; else echo "stdin closed"; fi
echo "args: $*"
echo "cookie=$cookie"
echo "routes=$HPCHUB_ROUTES domains=$HPCHUB_DOMAINS"
case "$*" in
  *bad.example.org*) echo "Failed to connect to bad.example.org" >&2; exit 1 ;;
  *stubborn.example.org*) trap '' INT ;;
  *) trap 'echo "got SIGINT" >&2; exit 0' INT ;;
esac
echo "Configured as 10.0.0.2, with SSL connected"
while true; do sleep 0.1; done
"#;

struct Helper {
    child: Child,
    socket: PathBuf,
}

impl Drop for Helper {
    fn drop(&mut self) {
        let _ = self.child.kill();
        let _ = self.child.wait();
    }
}

fn temp_dir(tag: &str) -> PathBuf {
    let d = std::env::temp_dir().join(format!("hpchub-vpn-{tag}-{}", std::process::id()));
    let _ = fs::remove_dir_all(&d);
    fs::create_dir_all(d.join("openconnect")).unwrap();
    let oc = d.join("openconnect/openconnect");
    fs::write(&oc, FAKE_OPENCONNECT).unwrap();
    fs::set_permissions(&oc, fs::Permissions::from_mode(0o755)).unwrap();
    d
}

fn start(dir: &Path, users: &[String]) -> Helper {
    let config = dir.join("config.json");
    let cfg = json!({"version": 1, "users": users, "gateways": ["vpn.example.edu", "bad.example.org", "stubborn.example.org"]});
    fs::write(&config, cfg.to_string()).unwrap();
    let socket = dir.join("helper.sock");
    let child = Command::new(env!("CARGO_BIN_EXE_hpc-hub-vpn-helper"))
        .arg("serve")
        .arg("--socket")
        .arg(&socket)
        .arg("--config")
        .arg(&config)
        .arg("--dir")
        .arg(dir)
        .spawn()
        .unwrap();
    let helper = Helper { child, socket };
    let end = Instant::now() + Duration::from_secs(10);
    while UnixStream::connect(&helper.socket).is_err() {
        assert!(Instant::now() < end, "the helper never listened");
        sleep(Duration::from_millis(50));
    }
    helper
}

fn ask(h: &Helper, msg: &Value) -> Value {
    let mut s = UnixStream::connect(&h.socket).unwrap();
    s.write_all(format!("{msg}\n").as_bytes()).unwrap();
    let mut line = String::new();
    BufReader::new(s).read_line(&mut line).unwrap();
    serde_json::from_str(&line).unwrap()
}

fn up_msg(url: &str) -> Value {
    json!({"op": "up", "url": url, "cookie": "webvpn=s3cret-cookie", "servercert": "pin-sha256:abc=",
           "useragent": "AnyConnect Linux_64 4.10", "protocol": "anyconnect", "resolve": "",
           "routes": ["10.0.0.0/8", "192.0.2.0/24"], "domains": ["example.edu"]})
}

/// Poll status until the state is `want`.
fn wait_state(h: &Helper, want: &str) -> Value {
    let end = Instant::now() + Duration::from_secs(10);
    loop {
        let s = ask(h, &json!({"op": "status"}));
        assert_eq!(s["ok"], true);
        if s["state"] == want {
            return s;
        }
        assert!(Instant::now() < end, "never got {want}: {s}");
        sleep(Duration::from_millis(50));
    }
}

fn my_uid() -> u32 {
    unsafe { libc::getuid() }
}

#[test]
fn version_status_up_down() {
    let dir = temp_dir("main");
    let h = start(&dir, &[my_uid().to_string()]);

    assert_eq!(ask(&h, &json!({"op": "version"})), json!({"ok": true, "version": "1"}));
    let s = ask(&h, &json!({"op": "status"}));
    assert_eq!(s["state"], "down");
    assert_eq!(s["log"], json!([]));

    assert_eq!(ask(&h, &up_msg("https://VPN.example.edu/group")), json!({"ok": true}));
    let s = wait_state(&h, "up");
    assert_eq!(s["gateway"], "vpn.example.edu");
    assert_eq!(s["error"], "");
    let log: Vec<String> = serde_json::from_value(s["log"].clone()).unwrap();
    assert!(log.contains(&"stdin closed".to_string()), "{log:?}");
    assert!(log.contains(&"cookie=***".to_string()), "the cookie is never logged: {log:?}");
    assert!(log.contains(&"routes=10.0.0.0/8 192.0.2.0/24 domains=example.edu".to_string()), "{log:?}");
    let args = log.iter().find(|l| l.starts_with("args: ")).unwrap();
    let script = dir.join("openconnect/hpchub-script.sh");
    assert_eq!(
        args,
        &format!(
            "args: --protocol anyconnect --useragent AnyConnect Linux_64 4.10 --servercert pin-sha256:abc= \
             --cookie-on-stdin --non-inter --script '{}' https://VPN.example.edu/group",
            script.display()
        )
    );
    assert!(!s.to_string().contains("s3cret"));

    // up again: the old one is stopped first
    assert_eq!(ask(&h, &up_msg("https://vpn.example.edu")), json!({"ok": true}));
    wait_state(&h, "up");

    assert_eq!(ask(&h, &json!({"op": "down"})), json!({"ok": true}));
    let s = ask(&h, &json!({"op": "status"}));
    assert_eq!(s["state"], "down");
    assert_eq!(s["error"], "", "a stop we asked for is no error");
    assert!(s["log"].as_array().unwrap().iter().any(|l| l == "got SIGINT"), "{s}");

    // down when nothing runs
    assert_eq!(ask(&h, &json!({"op": "down"})), json!({"ok": true}));
    drop(h);
    let _ = fs::remove_dir_all(&dir);
}

#[test]
fn failure_and_refusals() {
    let dir = temp_dir("fail");
    let h = start(&dir, &[my_uid().to_string()]);

    // openconnect fails: down with its last error line
    assert_eq!(ask(&h, &up_msg("https://bad.example.org")), json!({"ok": true}));
    let s = wait_state(&h, "down");
    assert_eq!(s["error"], "Failed to connect to bad.example.org");
    assert_eq!(s["gateway"], "bad.example.org");

    for (msg, why) in [
        (up_msg("https://evil.example.com"), "not a gateway"),
        (up_msg("http://vpn.example.edu"), "https only"),
        (up_msg("https://vpn.example.edu.evil.com"), "suffix"),
        (json!({"op": "up", "url": "https://vpn.example.edu"}), "missing fields"),
        (json!({"op": "reboot"}), "unknown op"),
    ] {
        let a = ask(&h, &msg);
        assert_eq!(a["ok"], false, "{why}: {a}");
        assert!(a["error"].as_str().is_some_and(|e| !e.is_empty()), "{why}: {a}");
    }
    let mut bad = up_msg("https://vpn.example.edu");
    bad["routes"] = json!(["10.0.0.0/8", "not-a-net"]);
    assert_eq!(ask(&h, &bad)["ok"], false);
    let mut bad = up_msg("https://vpn.example.edu");
    bad["domains"] = json!(["example.edu; reboot"]);
    assert_eq!(ask(&h, &bad)["ok"], false);
    let mut bad = up_msg("https://vpn.example.edu");
    bad["cookie"] = json!("a\nb");
    assert_eq!(ask(&h, &bad)["ok"], false);
    let mut bad = up_msg("https://vpn.example.edu");
    bad["protocol"] = json!("openvpn");
    assert_eq!(ask(&h, &bad)["ok"], false);
    // nothing was started by the refusals
    assert_eq!(ask(&h, &json!({"op": "status"}))["state"], "down");
    drop(h);
    let _ = fs::remove_dir_all(&dir);
}

#[test]
fn kills_after_five_seconds() {
    let dir = temp_dir("stubborn");
    let h = start(&dir, &[my_uid().to_string()]);
    assert_eq!(ask(&h, &up_msg("https://stubborn.example.org")), json!({"ok": true}));
    wait_state(&h, "up");
    let t = Instant::now();
    assert_eq!(ask(&h, &json!({"op": "down"})), json!({"ok": true}));
    assert!(t.elapsed() >= Duration::from_secs(5), "SIGINT is ignored, so it took the kill");
    let s = ask(&h, &json!({"op": "status"}));
    assert_eq!(s["state"], "down");
    assert_eq!(s["error"], "");
    drop(h);
    let _ = fs::remove_dir_all(&dir);
}

#[test]
fn other_uid_is_refused() {
    let dir = temp_dir("uid");
    let other = if my_uid() == 4242 { 4243 } else { 4242 };
    let h = start(&dir, &[other.to_string()]);
    for op in ["version", "status", "down"] {
        let a = ask(&h, &json!({"op": op}));
        assert_eq!(a["ok"], false, "{op}: {a}");
        assert!(a["error"].as_str().unwrap().contains("Not allowed"));
    }
    assert_eq!(ask(&h, &up_msg("https://vpn.example.edu"))["ok"], false);
    drop(h);
    let _ = fs::remove_dir_all(&dir);
}

#[test]
fn sigterm_takes_the_tunnel_down() {
    let dir = temp_dir("term");
    let mut h = start(&dir, &[my_uid().to_string()]);
    assert_eq!(ask(&h, &up_msg("https://vpn.example.edu")), json!({"ok": true}));
    wait_state(&h, "up");
    let pid: i32 = fs::read_to_string(dir.join("openconnect/pid")).unwrap().trim().parse().unwrap();
    unsafe { libc::kill(h.child.id() as i32, libc::SIGTERM) };
    let status = h.child.wait().unwrap();
    assert!(status.success(), "{status}");
    assert_ne!(unsafe { libc::kill(pid, 0) }, 0, "openconnect is gone too");
    assert!(!h.socket.exists());
    drop(h);
    let _ = fs::remove_dir_all(&dir);
}

#[test]
fn version_flag() {
    let out = Command::new(env!("CARGO_BIN_EXE_hpc-hub-vpn-helper")).arg("--version").output().unwrap();
    assert!(out.status.success());
    assert!(String::from_utf8_lossy(&out.stdout).starts_with("hpc-hub-vpn-helper "));
    let out = Command::new(env!("CARGO_BIN_EXE_hpc-hub-vpn-helper")).arg("bogus").output().unwrap();
    assert!(!out.status.success());
}
