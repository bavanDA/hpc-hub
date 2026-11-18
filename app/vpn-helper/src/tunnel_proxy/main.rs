//! hpc-hub-vpn-tunnel: the VPN without administrator. openconnect --script-tun starts it with the tunnel
//! (VPNFD, or VPNPIPE on Windows) and the tunnel's settings in its environment; it forwards local ports through
//! the tunnel with a TCP/IP stack of its own, like ocproxy:
//!
//!     hpc-hub-vpn-tunnel -L 52011:login.example.edu:22 [-L ...] [-k 30] [--pid-file FILE]
//!
//! Only programs that use those ports go over the VPN (HPC Hub's SSH); the computer's network is untouched.

mod link;
mod stack;

use std::net::{Ipv4Addr, TcpListener};
use std::process::ExitCode;
use std::sync::Arc;

use stack::{Forward, Settings};

fn parse_forward(spec: &str) -> Result<Forward, String> {
    let bad = || format!("-L wants LOCALPORT:HOST:PORT, not {spec:?}");
    let (local, rest) = spec.split_once(':').ok_or_else(bad)?;
    let (host, port) = rest.rsplit_once(':').ok_or_else(bad)?;
    let host = host.trim_start_matches('[').trim_end_matches(']');
    if host.is_empty() || !host.chars().all(|c| c.is_ascii_alphanumeric() || ".-_".contains(c)) {
        return Err(bad());
    }
    Ok(Forward { local: local.parse().map_err(|_| bad())?, host: host.to_string(), port: port.parse().map_err(|_| bad())? })
}

struct Args {
    forwards: Vec<Forward>,
    keepalive: Option<u64>,
    pid_file: Option<String>,
}

fn parse_args(args: &[String]) -> Result<Args, String> {
    let mut out = Args { forwards: vec![], keepalive: None, pid_file: None };
    let mut i = 0;
    while i < args.len() {
        let value = || args.get(i + 1).cloned().ok_or_else(|| format!("{} needs a value", args[i]));
        match args[i].as_str() {
            "-L" => out.forwards.push(parse_forward(&value()?)?),
            "-k" => out.keepalive = Some(value()?.parse().map_err(|_| "-k wants seconds".to_string())?),
            "--pid-file" => out.pid_file = Some(value()?),
            other => return Err(format!("unknown argument {other:?}")),
        }
        i += 2;
    }
    if out.forwards.is_empty() {
        return Err("nothing to forward (-L)".into());
    }
    Ok(out)
}

/// The tunnel's settings, from the environment openconnect gives its script.
fn settings(env: impl Fn(&str) -> Option<String>, keepalive: Option<u64>) -> Result<Settings, String> {
    let address: Ipv4Addr = env("INTERNAL_IP4_ADDRESS").and_then(|a| a.trim().parse().ok())
        .ok_or("INTERNAL_IP4_ADDRESS is missing: start this from openconnect --script-tun")?;
    let mtu = env("INTERNAL_IP4_MTU").and_then(|m| m.trim().parse().ok()).filter(|m| (576..=9000).contains(m))
        .unwrap_or(1300);
    let dns = env("INTERNAL_IP4_DNS").unwrap_or_default().split_whitespace().filter_map(|d| d.parse().ok()).collect();
    let domains = env("CISCO_DEF_DOMAIN").unwrap_or_default().split([' ', ',', ';']).filter(|d| !d.is_empty())
        .map(str::to_string).collect();
    Ok(Settings { address, mtu, dns, domains, keepalive })
}

#[cfg(unix)]
fn open_link() -> Result<Arc<dyn link::Link>, String> {
    let fd: i32 = std::env::var("VPNFD").ok().and_then(|f| f.parse().ok())
        .ok_or("VPNFD is missing: start this from openconnect --script-tun")?;
    Ok(Arc::new(link::Datagram::from_fd(fd).map_err(|e| e.to_string())?))
}

#[cfg(windows)]
fn open_link() -> Result<Arc<dyn link::Link>, String> {
    let name = std::env::var("VPNPIPE").map_err(|_| "VPNPIPE is missing: start this from openconnect --script-tun")?;
    Ok(Arc::new(link::Pipe::open(&name).map_err(|e| format!("could not open the tunnel: {e}"))?))
}

fn main() -> ExitCode {
    let args: Vec<String> = std::env::args().skip(1).collect();
    if args.first().map(String::as_str) == Some("--version") {
        println!("hpc-hub-vpn-tunnel {}", env!("CARGO_PKG_VERSION"));
        return ExitCode::SUCCESS;
    }
    match start(&args) {
        Ok(()) => ExitCode::SUCCESS,
        Err(e) => {
            eprintln!("hpc-hub-vpn-tunnel: {e}");
            ExitCode::from(1)
        }
    }
}

fn start(args: &[String]) -> Result<(), String> {
    let args = parse_args(args)?;
    let settings = settings(|k| std::env::var(k).ok(), args.keepalive)?;
    let link = open_link()?;
    let mut listeners = Vec::new();
    for f in &args.forwards {
        listeners.push(TcpListener::bind(("127.0.0.1", f.local)).map_err(|e| format!("port {}: {e}", f.local))?);
    }
    if let Some(path) = &args.pid_file {
        std::fs::write(path, std::process::id().to_string()).map_err(|e| format!("{path}: {e}"))?;
    }
    eprintln!("hpc-hub-vpn-tunnel: up as {} (MTU {}, DNS {:?})", settings.address, settings.mtu, settings.dns);
    let result = stack::run(link, settings, args.forwards, listeners).map_err(|e| e.to_string());
    if let Some(path) = &args.pid_file {
        let _ = std::fs::remove_file(path);
    }
    result
}

#[cfg(test)]
mod tests;
