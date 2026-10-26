//! hpc-hub-vpn-helper: runs openconnect as admin for HPC Hub, only for the gateways and the account it was
//! installed for. See docs/design/vpn-helper.md.

mod config;
mod install;
mod openconnect;
mod protocol;
mod server;
mod tunnel;
#[cfg(unix)]
mod unix;
mod validate;
#[cfg(windows)]
mod windows;

use std::path::PathBuf;
use std::process::ExitCode;

use config::Config;
use server::Server;
use tunnel::Tunnel;

/// Where things go on this platform (Linux has no install; tests pass --socket, --config and --dir).
pub mod paths {
    #[cfg(windows)]
    pub const DIR: &str = r"C:\Program Files\HPC Hub VPN";
    #[cfg(not(windows))]
    pub const DIR: &str = "/Library/Application Support/HPC Hub VPN";
    #[cfg(windows)]
    pub const ENDPOINT: &str = r"\\.\pipe\hpc-hub-vpn";
    #[cfg(not(windows))]
    pub const ENDPOINT: &str = "/var/run/hpc-hub-vpn.sock";
    #[cfg(windows)]
    pub const HELPER: &str = "hpc-hub-vpn-helper.exe";
    #[cfg(not(windows))]
    pub const HELPER: &str = "hpc-hub-vpn-helper";
    pub const CONFIG: &str = "config.json";
}

const USAGE: &str = "usage: hpc-hub-vpn-helper install --user <uid|SID> --gateway <host> [--gateway <host>...] --from <dir>
       hpc-hub-vpn-helper uninstall
       hpc-hub-vpn-helper serve [--socket <path>] [--config <path>] [--dir <install dir>]
       hpc-hub-vpn-helper --version";

fn main() -> ExitCode {
    let args: Vec<String> = std::env::args().skip(1).collect();
    let rest = args.get(1..).unwrap_or_default();
    let result = match args.first().map(String::as_str) {
        Some("--version" | "-V" | "version") => {
            println!("hpc-hub-vpn-helper {} (protocol {})", env!("CARGO_PKG_VERSION"), protocol::VERSION);
            Ok(())
        }
        Some("--help" | "-h" | "help") => {
            println!("{USAGE}");
            Ok(())
        }
        Some("serve") => serve(rest),
        Some("install") => install::parse(rest).and_then(install::install),
        Some("uninstall") if rest.is_empty() => install::uninstall(),
        _ => Err(format!("unknown command\n{USAGE}")),
    };
    match result {
        Ok(()) => ExitCode::SUCCESS,
        Err(e) => {
            eprintln!("hpc-hub-vpn-helper: {e}");
            ExitCode::FAILURE
        }
    }
}

/// `--name value` pairs, each name one of `names`.
pub fn options(args: &[String], names: &[&str]) -> Result<Vec<(String, String)>, String> {
    let mut out = Vec::new();
    let mut it = args.iter();
    while let Some(flag) = it.next() {
        let name = flag.strip_prefix("--").filter(|n| names.contains(n)).ok_or(format!("unknown option {flag}"))?;
        let value = it.next().ok_or(format!("{flag} needs a value"))?;
        out.push((name.to_string(), value.clone()));
    }
    Ok(out)
}

fn serve(args: &[String]) -> Result<(), String> {
    let (mut socket, mut config, mut dir) = (None, None, None);
    for (name, value) in options(args, &["socket", "config", "dir"])? {
        match name.as_str() {
            "socket" => socket = Some(value),
            "config" => config = Some(PathBuf::from(value)),
            _ => dir = Some(PathBuf::from(value)),
        }
    }
    let dir = dir.unwrap_or_else(|| PathBuf::from(paths::DIR));
    let config = Config::load(&config.unwrap_or_else(|| dir.join(paths::CONFIG)))?;
    let endpoint = socket.unwrap_or_else(|| paths::ENDPOINT.to_string());
    let server = Server { config, tunnel: Tunnel::new(dir) };
    #[cfg(unix)]
    return unix::serve(std::sync::Arc::new(server), std::path::Path::new(&endpoint));
    #[cfg(windows)]
    return windows::run(server, endpoint);
}

#[cfg(test)]
mod tests {
    use super::*;

    fn s(v: &[&str]) -> Vec<String> {
        v.iter().map(|x| x.to_string()).collect()
    }

    #[test]
    fn parses_options() {
        let o = options(&s(&["--socket", "/tmp/s", "--dir", "/x"]), &["socket", "dir"]).unwrap();
        assert_eq!(o, [("socket".to_string(), "/tmp/s".to_string()), ("dir".to_string(), "/x".to_string())]);
        assert!(options(&s(&["--socket"]), &["socket"]).is_err());
        assert!(options(&s(&["--evil", "x"]), &["socket"]).is_err());
        assert!(options(&s(&["socket", "x"]), &["socket"]).is_err());
        assert!(options(&[], &["socket"]).unwrap().is_empty());
    }
}
