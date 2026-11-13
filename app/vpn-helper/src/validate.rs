//! Checks on what a caller sends (and on config.json). Small pure functions, so they are easy to test.

use std::net::IpAddr;

/// Longest string a request may carry, in bytes.
pub const MAX_STR: usize = 8 * 1024;

/// The openconnect protocols the helper runs.
pub const PROTOCOLS: &[&str] = &["anyconnect", "gp", "nc", "pulse", "f5", "fortinet", "array"];

/// No newline, carriage return or NUL, and at most 8 KB.
pub fn check_str(name: &str, s: &str) -> Result<(), String> {
    if s.len() > MAX_STR {
        return Err(format!("{name} is too long"));
    }
    if s.contains(['\n', '\r', '\0']) {
        return Err(format!("{name} has a newline or NUL in it"));
    }
    Ok(())
}

/// A host name: letters, digits, dots and dashes, not starting with a dot or dash.
pub fn is_host(s: &str) -> bool {
    !s.is_empty()
        && s.len() <= 253
        && !s.starts_with(['.', '-'])
        && s.bytes().all(|b| b.is_ascii_alphanumeric() || b == b'.' || b == b'-')
}

/// The gateway url: `https://host[:port][/path]` with host in `gateways` (any case). Returns the host, lowercase.
pub fn check_url(url: &str, gateways: &[String]) -> Result<String, String> {
    check_str("url", url)?;
    let rest = match url.get(..8) {
        Some(scheme) if scheme.eq_ignore_ascii_case("https://") => &url[8..],
        _ => return Err("The gateway url must start with https://".into()),
    };
    let end = rest.find(['/', '?', '#']).unwrap_or(rest.len());
    let (authority, tail) = rest.split_at(end);
    let (host, port) = match authority.split_once(':') {
        Some((h, p)) => (h, Some(p)),
        None => (authority, None),
    };
    if let Some(p) = port
        && (p.is_empty() || !p.bytes().all(|b| b.is_ascii_digit()) || !matches!(p.parse::<u16>(), Ok(1..)))
    {
        return Err("The gateway url has a bad port".into());
    }
    if !is_host(host) {
        return Err("The gateway url has no valid host".into());
    }
    if tail.bytes().any(|b| b <= b' ' || b == 0x7f || b == b'\\') {
        return Err("The gateway url has spaces or control characters".into());
    }
    let host = host.to_ascii_lowercase();
    if !gateways.iter().any(|g| g.eq_ignore_ascii_case(&host)) {
        return Err(format!("{host} is not a gateway this helper was set up for"));
    }
    Ok(host)
}

/// A network in CIDR form, IPv4 or IPv6 ("10.0.0.0/8", "2001:db8::/32").
pub fn is_cidr(s: &str) -> bool {
    let Some((addr, len)) = s.split_once('/') else { return false };
    if len.is_empty() || len.len() > 3 || !len.bytes().all(|b| b.is_ascii_digit()) {
        return false;
    }
    let Ok(len) = len.parse::<u8>() else { return false };
    match addr.parse::<IpAddr>() {
        Ok(IpAddr::V4(_)) => len <= 32,
        Ok(IpAddr::V6(_)) => len <= 128,
        Err(_) => false,
    }
}

/// A DNS domain for split DNS: `[A-Za-z0-9.-]+`.
pub fn is_domain(s: &str) -> bool {
    !s.is_empty() && s.bytes().all(|b| b.is_ascii_alphanumeric() || b == b'.' || b == b'-')
}

/// A tunnel's name (the app uses the cluster's id): 1 to 32 of `a-z 0-9 -`, starting with a letter or digit. It
/// goes into DNS rule names and file contents, so nothing else.
pub fn is_tunnel_name(s: &str) -> bool {
    (1..=32).contains(&s.len())
        && !s.starts_with('-')
        && s.bytes().all(|b| b.is_ascii_lowercase() || b.is_ascii_digit() || b == b'-')
}

pub fn is_protocol(s: &str) -> bool {
    PROTOCOLS.contains(&s)
}

/// `--resolve`: empty, or `host:ip` for the gateway's own host.
pub fn check_resolve(s: &str, host: &str) -> Result<(), String> {
    if s.is_empty() {
        return Ok(());
    }
    match s.split_once(':') {
        Some((h, ip)) if h.eq_ignore_ascii_case(host) && ip.parse::<IpAddr>().is_ok() => Ok(()),
        _ => Err("resolve must be <gateway host>:<ip>".into()),
    }
}

/// A macOS (or Linux) uid, as a string.
pub fn is_uid(s: &str) -> bool {
    !s.is_empty() && s.len() <= 10 && s.bytes().all(|b| b.is_ascii_digit())
}

/// A Windows SID in string form ("S-1-5-21-...").
pub fn is_sid(s: &str) -> bool {
    s.len() <= 200
        && s.strip_prefix("S-1-").is_some_and(|rest| {
            !rest.is_empty()
                && rest.split('-').all(|part| !part.is_empty() && part.bytes().all(|b| b.is_ascii_digit()))
        })
}

/// Who may be in config `users` on this platform.
pub fn is_user_id(s: &str) -> bool {
    if cfg!(windows) { is_sid(s) } else { is_uid(s) }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn tunnel_names() {
        for good in ["wulver", "yale", "a", "my-cluster-2", &"x".repeat(32)] {
            assert!(is_tunnel_name(good), "{good}");
        }
        for bad in ["", "-x", "Wulver", "a b", "a/b", "a.b", "a'b", "é", &"x".repeat(33)] {
            assert!(!is_tunnel_name(bad), "{bad}");
        }
    }

    fn gws() -> Vec<String> {
        vec!["vpn.example.edu".into(), "access.example.org".into()]
    }

    #[test]
    fn strings() {
        assert!(check_str("x", "plain text").is_ok());
        assert!(check_str("x", "").is_ok());
        assert!(check_str("x", "a\nb").is_err());
        assert!(check_str("x", "a\rb").is_err());
        assert!(check_str("x", "a\0b").is_err());
        assert!(check_str("x", &"a".repeat(MAX_STR)).is_ok());
        assert!(check_str("x", &"a".repeat(MAX_STR + 1)).is_err());
    }

    #[test]
    fn url_allowlist() {
        assert_eq!(check_url("https://vpn.example.edu", &gws()).unwrap(), "vpn.example.edu");
        assert_eq!(check_url("https://VPN.Example.EDU/group", &gws()).unwrap(), "vpn.example.edu");
        assert_eq!(check_url("HTTPS://access.example.org/", &gws()).unwrap(), "access.example.org");
        assert_eq!(check_url("https://vpn.example.edu:443/x?y=1", &gws()).unwrap(), "vpn.example.edu");
        assert!(check_url("https://evil.example.com", &gws()).is_err());
        assert!(check_url("https://vpn.example.edu.evil.com", &gws()).is_err());
        assert!(check_url("https://evil.com@vpn.example.edu", &gws()).is_err());
        assert!(check_url("https://vpn.example.edu@evil.com", &gws()).is_err());
        assert!(check_url("https://vpn.example.edu.", &gws()).is_err());
        assert!(check_url("https://", &gws()).is_err());
    }

    #[test]
    fn url_https_only() {
        assert!(check_url("http://vpn.example.edu", &gws()).is_err());
        assert!(check_url("vpn.example.edu", &gws()).is_err());
        assert!(check_url("//vpn.example.edu", &gws()).is_err());
        assert!(check_url("ftp://vpn.example.edu", &gws()).is_err());
    }

    #[test]
    fn url_bad_parts() {
        assert!(check_url("https://vpn.example.edu:0", &gws()).is_err());
        assert!(check_url("https://vpn.example.edu:99999", &gws()).is_err());
        assert!(check_url("https://vpn.example.edu:", &gws()).is_err());
        assert!(check_url("https://vpn.example.edu:+443", &gws()).is_err());
        assert!(check_url("https://vpn.example.edu/a b", &gws()).is_err());
        assert!(check_url("https://vpn.example.edu/a\\b", &gws()).is_err());
        assert!(check_url("https://vpn.example.edu/a\nb", &gws()).is_err());
        assert!(check_url("https://[::1]/", &gws()).is_err());
    }

    #[test]
    fn cidrs() {
        for ok in ["10.0.0.0/8", "128.235.0.0/16", "0.0.0.0/0", "1.2.3.4/32", "2001:db8::/32", "::/0", "::1/128"] {
            assert!(is_cidr(ok), "{ok}");
        }
        for bad in [
            "10.0.0.0", "10.0.0.0/33", "10.0.0/8", "10.0.0.0/", "/8", "10.0.0.0/+8", "10.0.0.0/-1",
            "2001:db8::/129", "host/8", "10.0.0.0/8 ", " 10.0.0.0/8", "10.0.0.0/0008", "",
        ] {
            assert!(!is_cidr(bad), "{bad}");
        }
    }

    #[test]
    fn domains() {
        assert!(is_domain("njit.edu"));
        assert!(is_domain("cs.example-uni.org"));
        assert!(is_domain("A1.b2"));
        assert!(!is_domain(""));
        assert!(!is_domain("~njit.edu"));
        assert!(!is_domain("a b"));
        assert!(!is_domain("a;b"));
        assert!(!is_domain("a_b"));
        assert!(!is_domain("$(x)"));
    }

    #[test]
    fn protocols() {
        for p in PROTOCOLS {
            assert!(is_protocol(p));
        }
        assert!(!is_protocol("AnyConnect"));
        assert!(!is_protocol("openvpn"));
        assert!(!is_protocol(""));
    }

    #[test]
    fn resolve() {
        assert!(check_resolve("", "vpn.example.edu").is_ok());
        assert!(check_resolve("vpn.example.edu:192.0.2.7", "vpn.example.edu").is_ok());
        assert!(check_resolve("VPN.example.edu:2001:db8::7", "vpn.example.edu").is_ok());
        assert!(check_resolve("other.example.edu:192.0.2.7", "vpn.example.edu").is_err());
        assert!(check_resolve("vpn.example.edu:not-an-ip", "vpn.example.edu").is_err());
        assert!(check_resolve("vpn.example.edu", "vpn.example.edu").is_err());
    }

    #[test]
    fn user_ids() {
        assert!(is_uid("501"));
        assert!(is_uid("4242"));
        assert!(!is_uid(""));
        assert!(!is_uid("-1"));
        assert!(!is_uid("jdoe"));
        assert!(is_sid("S-1-5-21-1111111111-2222222222-3333333333-1001"));
        assert!(is_sid("S-1-5-18"));
        assert!(!is_sid("S-1-"));
        assert!(!is_sid("S-1-5--1"));
        assert!(!is_sid("S-1-5-21)(A;;GA;;;WD"));
        assert!(!is_sid("s-1-5-18"));
    }

    #[test]
    fn hosts() {
        assert!(is_host("vpn.example.edu"));
        assert!(!is_host("-vpn.example.edu"));
        assert!(!is_host(".example.edu"));
        assert!(!is_host("vpn example"));
        assert!(!is_host(""));
    }
}
