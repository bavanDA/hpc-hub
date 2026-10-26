//! How openconnect is run: its path in the install folder, its argv and the two HPCHUB_* variables.

use std::path::{Path, PathBuf};

use crate::protocol::Up;

#[cfg(windows)]
const PROGRAM: &str = "openconnect.exe";
#[cfg(not(windows))]
const PROGRAM: &str = "openconnect";
#[cfg(windows)]
const SCRIPT: &str = "hpchub-script.js";
#[cfg(not(windows))]
const SCRIPT: &str = "hpchub-script.sh";

/// `<dir>/openconnect`: openconnect, its libraries and scripts.
pub fn folder(dir: &Path) -> PathBuf {
    dir.join("openconnect")
}

pub fn program(dir: &Path) -> PathBuf {
    folder(dir).join(PROGRAM)
}

pub fn wrapper(dir: &Path) -> PathBuf {
    folder(dir).join(SCRIPT)
}

/// The `--script` value for `script`. openconnect runs it with `/bin/sh -c <value>` on Unix, so the path goes in
/// single quotes there; on Windows it runs `cscript.exe /e:JScript "<value>"` itself, so the path goes as is.
pub fn script_arg(script: &str, windows: bool) -> Result<String, String> {
    if windows {
        if script.contains('"') {
            return Err("The script path has a quote in it".into());
        }
        Ok(script.to_string())
    } else {
        Ok(format!("'{}'", script.replace('\'', r"'\''")))
    }
}

/// The arguments after the program name (the cookie goes on stdin).
pub fn args(up: &Up, script: &str) -> Vec<String> {
    let mut a: Vec<String> = vec![
        "--protocol".into(),
        up.protocol.clone(),
        "--useragent".into(),
        up.useragent.clone(),
        "--servercert".into(),
        up.servercert.clone(),
        "--cookie-on-stdin".into(),
        "--non-inter".into(),
        "--script".into(),
        script.into(),
    ];
    if !up.resolve.is_empty() {
        a.push("--resolve".into());
        a.push(up.resolve.clone());
    }
    a.push(up.url.clone());
    a
}

/// HPCHUB_ROUTES and HPCHUB_DOMAINS, space separated, maybe empty. openconnect passes them on to the script.
pub fn env(up: &Up) -> [(&'static str, String); 2] {
    [("HPCHUB_ROUTES", up.routes.join(" ")), ("HPCHUB_DOMAINS", up.domains.join(" "))]
}

#[cfg(test)]
mod tests {
    use super::*;

    fn up() -> Up {
        Up {
            url: "https://vpn.example.edu/group".into(),
            cookie: "webvpn=secret".into(),
            servercert: "pin-sha256:abc=".into(),
            useragent: "AnyConnect Linux_64 4.10".into(),
            protocol: "anyconnect".into(),
            resolve: "vpn.example.edu:192.0.2.7".into(),
            routes: vec!["10.0.0.0/8".into(), "192.0.2.0/24".into()],
            domains: vec!["example.edu".into(), "cs.example.edu".into()],
        }
    }

    #[test]
    fn argv() {
        let a = args(&up(), "'/x/hpchub-script.sh'");
        assert_eq!(
            a,
            [
                "--protocol", "anyconnect", "--useragent", "AnyConnect Linux_64 4.10", "--servercert",
                "pin-sha256:abc=", "--cookie-on-stdin", "--non-inter", "--script", "'/x/hpchub-script.sh'",
                "--resolve", "vpn.example.edu:192.0.2.7", "https://vpn.example.edu/group",
            ]
        );
        assert!(!a.iter().any(|s| s.contains("secret")), "the cookie never goes in argv");
    }

    #[test]
    fn argv_without_resolve() {
        let mut u = up();
        u.resolve.clear();
        let a = args(&u, "s");
        assert!(!a.contains(&"--resolve".to_string()));
        assert_eq!(a.last().unwrap(), "https://vpn.example.edu/group");
    }

    #[test]
    fn environment() {
        let e = env(&up());
        assert_eq!(e[0], ("HPCHUB_ROUTES", "10.0.0.0/8 192.0.2.0/24".to_string()));
        assert_eq!(e[1], ("HPCHUB_DOMAINS", "example.edu cs.example.edu".to_string()));
        let mut u = up();
        u.routes.clear();
        u.domains.clear();
        assert_eq!(env(&u), [("HPCHUB_ROUTES", String::new()), ("HPCHUB_DOMAINS", String::new())]);
    }

    #[test]
    fn script_quoting_macos() {
        let p = "/Library/Application Support/HPC Hub VPN/openconnect/hpchub-script.sh";
        assert_eq!(
            script_arg(p, false).unwrap(),
            "'/Library/Application Support/HPC Hub VPN/openconnect/hpchub-script.sh'"
        );
        assert_eq!(script_arg("/a/it's.sh", false).unwrap(), r"'/a/it'\''s.sh'");
    }

    #[test]
    fn script_quoting_windows() {
        let p = r"C:\Program Files\HPC Hub VPN\openconnect\hpchub-script.js";
        assert_eq!(script_arg(p, true).unwrap(), p);
        assert!(script_arg(r#"C:\a"b.js"#, true).is_err());
    }

    #[test]
    fn paths() {
        let dir = Path::new("/opt/x");
        assert!(program(dir).starts_with("/opt/x/openconnect"));
        assert!(wrapper(dir).starts_with("/opt/x/openconnect"));
    }
}
