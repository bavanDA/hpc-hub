//! The requests: one JSON line in, one JSON line out (docs/design/vpn-helper.md, "Protocol").

use serde::Deserialize;
use serde_json::{Value, json};

use crate::validate::{check_resolve, check_str, check_url, is_cidr, is_domain, is_protocol};

/// The protocol version `{"op": "version"}` answers; the app installs the helper again when it differs.
pub const VERSION: &str = "1";

/// Longest request line the helper reads, in bytes.
pub const MAX_LINE: u64 = 256 * 1024;

#[derive(Deserialize)]
#[serde(tag = "op", rename_all = "lowercase")]
pub enum Request {
    Version,
    Status,
    Up(Up),
    Down,
}

/// What `up` carries. No Debug: it holds the cookie.
#[derive(Deserialize, Clone, PartialEq)]
pub struct Up {
    pub url: String,
    pub cookie: String,
    pub servercert: String,
    pub useragent: String,
    pub protocol: String,
    #[serde(default)]
    pub resolve: String,
    #[serde(default)]
    pub routes: Vec<String>,
    #[serde(default)]
    pub domains: Vec<String>,
}

pub fn parse(line: &str) -> Result<Request, String> {
    serde_json::from_str(line.trim_end()).map_err(|_| "Bad request".to_string())
}

/// Everything `up` carries checked against the spec. Returns the gateway host.
pub fn check_up(up: &Up, gateways: &[String]) -> Result<String, String> {
    for (name, s) in [
        ("cookie", &up.cookie),
        ("servercert", &up.servercert),
        ("useragent", &up.useragent),
        ("protocol", &up.protocol),
        ("resolve", &up.resolve),
    ] {
        check_str(name, s)?;
    }
    let host = check_url(&up.url, gateways)?;
    if up.cookie.is_empty() {
        return Err("No cookie".into());
    }
    if !is_protocol(&up.protocol) {
        return Err(format!("Unknown protocol {}", up.protocol));
    }
    check_resolve(&up.resolve, &host)?;
    for r in &up.routes {
        check_str("route", r)?;
        if !is_cidr(r) {
            return Err(format!("Not a network: {r}"));
        }
    }
    for d in &up.domains {
        check_str("domain", d)?;
        if !is_domain(d) {
            return Err(format!("Not a domain: {d}"));
        }
    }
    Ok(host)
}

pub fn ok() -> Value {
    json!({"ok": true})
}

pub fn refuse(error: impl Into<String>) -> Value {
    json!({"ok": false, "error": error.into()})
}

#[cfg(test)]
mod tests {
    use super::*;

    fn gws() -> Vec<String> {
        vec!["vpn.example.edu".into()]
    }

    fn up_line() -> &'static str {
        r#"{"op": "up", "url": "https://vpn.example.edu", "cookie": "webvpn=abc", "servercert": "pin-sha256:xyz=",
            "useragent": "AnyConnect Linux_64 4.10", "protocol": "anyconnect", "resolve": "vpn.example.edu:192.0.2.7",
            "routes": ["10.0.0.0/8"], "domains": ["example.edu"]}"#
    }

    fn up() -> Up {
        match parse(&up_line().replace('\n', " ")).unwrap() {
            Request::Up(u) => u,
            _ => panic!("not up"),
        }
    }

    #[test]
    fn parses_simple_ops() {
        assert!(matches!(parse(r#"{"op": "version"}"#), Ok(Request::Version)));
        assert!(matches!(parse("{\"op\": \"status\"}\n"), Ok(Request::Status)));
        assert!(matches!(parse(r#"{"op": "down", "extra": 1}"#), Ok(Request::Down)));
    }

    #[test]
    fn parses_up() {
        let u = up();
        assert_eq!(u.url, "https://vpn.example.edu");
        assert_eq!(u.cookie, "webvpn=abc");
        assert_eq!(u.protocol, "anyconnect");
        assert_eq!(u.routes, ["10.0.0.0/8"]);
        assert_eq!(u.domains, ["example.edu"]);
        assert_eq!(check_up(&u, &gws()).unwrap(), "vpn.example.edu");
    }

    #[test]
    fn up_defaults() {
        let line = r#"{"op":"up","url":"https://vpn.example.edu","cookie":"c","servercert":"","useragent":"","protocol":"gp"}"#;
        let Ok(Request::Up(u)) = parse(line) else { panic!("not up") };
        assert!(u.resolve.is_empty() && u.routes.is_empty() && u.domains.is_empty());
        assert!(check_up(&u, &gws()).is_ok());
    }

    #[test]
    fn rejects_bad_json() {
        for bad in ["", "nope", "{}", r#"{"op": "reboot"}"#, r#"{"op": "up"}"#, r#"{"op": "up", "url": 1}"#, "[]"] {
            assert!(parse(bad).is_err(), "{bad}");
        }
    }

    #[test]
    fn up_refusals() {
        let gw = gws();
        let mut u = up();
        u.url = "https://other.example.com".into();
        assert!(check_up(&u, &gw).is_err());
        let mut u = up();
        u.url = "http://vpn.example.edu".into();
        assert!(check_up(&u, &gw).is_err());
        let mut u = up();
        u.cookie = "a\nb".into();
        assert!(check_up(&u, &gw).is_err());
        let mut u = up();
        u.cookie = String::new();
        assert!(check_up(&u, &gw).is_err());
        let mut u = up();
        u.useragent = "x".repeat(9000);
        assert!(check_up(&u, &gw).is_err());
        let mut u = up();
        u.servercert = "pin\0".into();
        assert!(check_up(&u, &gw).is_err());
        let mut u = up();
        u.protocol = "openvpn".into();
        assert!(check_up(&u, &gw).is_err());
        let mut u = up();
        u.routes = vec!["10.0.0.0/8".into(), "10.0.0.1".into()];
        assert!(check_up(&u, &gw).is_err());
        let mut u = up();
        u.domains = vec!["example.edu; rm -rf /".into()];
        assert!(check_up(&u, &gw).is_err());
        let mut u = up();
        u.resolve = "evil.example.com:192.0.2.7".into();
        assert!(check_up(&u, &gw).is_err());
    }
}
