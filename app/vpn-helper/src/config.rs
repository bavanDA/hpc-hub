//! config.json in the install folder: who may ask, and for which gateways.

use std::path::Path;

use serde::{Deserialize, Serialize};

use crate::validate::{is_host, is_user_id};

#[derive(Serialize, Deserialize, Debug, PartialEq)]
pub struct Config {
    pub version: u32,
    pub users: Vec<String>,
    pub gateways: Vec<String>,
}

impl Config {
    pub fn new(users: Vec<String>, gateways: Vec<String>) -> Result<Self, String> {
        let gateways = gateways.into_iter().map(|g| g.to_ascii_lowercase()).collect();
        let c = Config { version: 1, users, gateways };
        c.check()?;
        Ok(c)
    }

    pub fn load(path: &Path) -> Result<Self, String> {
        let text = std::fs::read_to_string(path).map_err(|e| format!("Can't read {}: {e}", path.display()))?;
        let c: Config = serde_json::from_str(&text).map_err(|e| format!("Bad {}: {e}", path.display()))?;
        c.check()?;
        Ok(c)
    }

    pub fn check(&self) -> Result<(), String> {
        if self.version != 1 {
            return Err(format!("config version {} is not supported", self.version));
        }
        if self.users.is_empty() {
            return Err("config has no users".into());
        }
        if let Some(u) = self.users.iter().find(|u| !is_user_id(u)) {
            return Err(format!("Not a user id: {u}"));
        }
        if self.gateways.is_empty() {
            return Err("config has no gateways".into());
        }
        if let Some(g) = self.gateways.iter().find(|g| !is_host(g)) {
            return Err(format!("Not a gateway host: {g}"));
        }
        Ok(())
    }

    /// Is `who` (a uid or a SID) one of the users?
    pub fn allows(&self, who: &str) -> bool {
        self.users.iter().any(|u| u.eq_ignore_ascii_case(who))
    }

    pub fn to_json(&self) -> String {
        serde_json::to_string_pretty(self).unwrap_or_default() + "\n"
    }

    /// The named pipe's security descriptor: SYSTEM and Administrators, plus read/write for each user (SIDs,
    /// checked by `check`, so nothing else gets into the SDDL).
    #[cfg_attr(not(windows), allow(dead_code))]
    pub fn pipe_sddl(&self) -> String {
        let users: String = self.users.iter().map(|sid| format!("(A;;GRGW;;;{sid})")).collect();
        format!("D:P(A;;GA;;;SY)(A;;GA;;;BA){users}")
    }
}

#[cfg(test)]
mod sddl_tests {
    use super::*;

    #[test]
    fn pipe_sddl() {
        let c = Config { version: 1, users: vec!["S-1-5-21-1-2-3-1001".into()], gateways: vec!["g.example".into()] };
        assert_eq!(c.pipe_sddl(), "D:P(A;;GA;;;SY)(A;;GA;;;BA)(A;;GRGW;;;S-1-5-21-1-2-3-1001)");
    }
}

#[cfg(all(test, unix))]
mod tests {
    use super::*;

    #[test]
    fn round_trip() {
        let c = Config::new(vec!["4242".into()], vec!["VPN.Example.edu".into()]).unwrap();
        assert_eq!(c.gateways, ["vpn.example.edu"]);
        let back: Config = serde_json::from_str(&c.to_json()).unwrap();
        assert_eq!(back, c);
        assert!(c.allows("4242"));
        assert!(!c.allows("4243"));
        assert!(!c.allows(""));
    }

    #[test]
    fn refuses_bad() {
        assert!(Config::new(vec![], vec!["vpn.example.edu".into()]).is_err());
        assert!(Config::new(vec!["jdoe".into()], vec!["vpn.example.edu".into()]).is_err());
        assert!(Config::new(vec!["4242".into()], vec![]).is_err());
        assert!(Config::new(vec!["4242".into()], vec!["https://vpn.example.edu".into()]).is_err());
        let v2 = r#"{"version": 2, "users": ["4242"], "gateways": ["vpn.example.edu"]}"#;
        assert!(serde_json::from_str::<Config>(v2).unwrap().check().is_err());
    }
}
