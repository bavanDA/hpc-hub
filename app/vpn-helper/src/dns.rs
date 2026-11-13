//! Split DNS clean-up. When a tunnel comes up, the wrapper script points only its domains at the VPN's DNS
//! servers, marked with `hpc-hub <tunnel name>`: macOS gets `/etc/resolver/<domain>` files, Windows gets NRPT rules
//! (docs/design/vpn-helper.md, "Several tunnels"). The helper removes them: a tunnel's when its openconnect exits,
//! however it ended, and all of them when the helper starts, since after a crash nothing else would, and a
//! leftover rule sends that cluster's names to a server that can't be reached.

/// The mark the wrapper scripts put on what they add.
pub const MARK: &str = "hpc-hub";

/// Remove the split DNS of tunnel `name`, or of every tunnel when None. Best effort: failures are only logged.
pub fn forget(name: Option<&str>) {
    #[cfg(target_os = "macos")]
    forget_files(std::path::Path::new("/etc/resolver"), name);
    #[cfg(windows)]
    forget_rules(name);
    #[cfg(not(any(target_os = "macos", windows)))]
    let _ = name; // Linux runs no helper (NetworkManager does the DNS); tests run without DNS changes
}

/// Is this resolver file's first line our mark, for `name` (or any tunnel)?
#[cfg_attr(not(target_os = "macos"), allow(dead_code))]
fn marked(text: &str, name: Option<&str>) -> bool {
    let first = text.lines().next().unwrap_or("");
    match first
        .strip_prefix("# ")
        .and_then(|r| r.strip_prefix(MARK))
        .and_then(|r| r.strip_prefix(' '))
    {
        Some(tunnel) => name.is_none_or(|n| n == tunnel),
        None => false,
    }
}

/// macOS: delete the files in `dir` marked for `name`, leaving everyone else's.
#[cfg_attr(not(target_os = "macos"), allow(dead_code))]
pub fn forget_files(dir: &std::path::Path, name: Option<&str>) {
    let Ok(entries) = std::fs::read_dir(dir) else {
        return;
    };
    for entry in entries.flatten() {
        let path = entry.path();
        // only regular files: never follow a link somewhere else
        if !entry.file_type().is_ok_and(|t| t.is_file()) {
            continue;
        }
        if std::fs::read_to_string(&path).is_ok_and(|text| marked(&text, name))
            && let Err(e) = std::fs::remove_file(&path)
        {
            eprintln!("hpc-hub-vpn-helper: could not remove {}: {e}", path.display());
        }
    }
}

/// The PowerShell that removes our NRPT rules (all of them, or one tunnel's). `name` is checked by the caller
/// (`validate::is_tunnel_name`), so it can go in the quotes.
#[cfg_attr(not(windows), allow(dead_code))]
pub fn remove_rules_command(name: Option<&str>) -> String {
    let test = match name {
        Some(n) => format!("$_.Comment -eq '{MARK} {n}'"),
        None => format!("$_.Comment -like '{MARK} *'"),
    };
    format!("Get-DnsClientNrptRule | Where-Object {{ {test} }} | Remove-DnsClientNrptRule -Force")
}

#[cfg(windows)]
fn forget_rules(name: Option<&str>) {
    use std::os::windows::process::CommandExt;
    use std::process::{Command, Stdio};

    const CREATE_NO_WINDOW: u32 = 0x0800_0000;
    let root = std::env::var("SystemRoot").unwrap_or_else(|_| r"C:\Windows".into());
    let powershell = format!(r"{root}\System32\WindowsPowerShell\v1.0\powershell.exe");
    let result = Command::new(powershell)
        .args([
            "-NoProfile",
            "-NonInteractive",
            "-ExecutionPolicy",
            "Bypass",
            "-Command",
        ])
        .arg(remove_rules_command(name))
        .stdin(Stdio::null())
        .creation_flags(CREATE_NO_WINDOW)
        .output();
    match result {
        Ok(out) if out.status.success() => {}
        Ok(out) => eprintln!(
            "hpc-hub-vpn-helper: removing DNS rules: {}",
            String::from_utf8_lossy(&out.stderr).trim()
        ),
        Err(e) => eprintln!("hpc-hub-vpn-helper: removing DNS rules: {e}"),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn marks() {
        assert!(marked(
            "# hpc-hub wulver\nnameserver 10.0.0.1\n",
            Some("wulver")
        ));
        assert!(marked("# hpc-hub wulver\n", None));
        assert!(!marked("# hpc-hub wulver\n", Some("yale")));
        assert!(!marked("# hpc-hub wulverine\n", Some("wulver")));
        assert!(
            !marked("nameserver 10.0.0.1\n# hpc-hub wulver\n", Some("wulver")),
            "only the first line counts"
        );
        assert!(!marked("# hpc-hubx wulver\n", None));
        assert!(!marked("", None));
    }

    #[test]
    fn rule_commands() {
        assert_eq!(
            remove_rules_command(Some("wulver")),
            "Get-DnsClientNrptRule | Where-Object { $_.Comment -eq 'hpc-hub wulver' } | Remove-DnsClientNrptRule -Force"
        );
        assert!(remove_rules_command(None).contains("$_.Comment -like 'hpc-hub *'"));
    }

    #[cfg(unix)]
    #[test]
    fn forgets_only_ours() {
        let dir = std::env::temp_dir().join(format!("hpchub-dns-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        let put = |f: &str, text: &str| std::fs::write(dir.join(f), text).unwrap();
        put("njit.edu", "# hpc-hub wulver\nnameserver 10.0.0.1\n");
        put("cs.njit.edu", "# hpc-hub wulver\nnameserver 10.0.0.1\n");
        put("yale.edu", "# hpc-hub yale\nnameserver 10.1.0.1\n");
        put("corp.example", "nameserver 192.0.2.53\n"); // the user's own
        std::os::unix::fs::symlink(dir.join("yale.edu"), dir.join("link.edu")).unwrap();
        let left = || {
            let mut v: Vec<String> = std::fs::read_dir(&dir)
                .unwrap()
                .map(|e| e.unwrap().file_name().into_string().unwrap())
                .collect();
            v.sort();
            v
        };
        forget_files(&dir, Some("wulver"));
        assert_eq!(left(), ["corp.example", "link.edu", "yale.edu"]);
        forget_files(&dir, None);
        assert_eq!(
            left(),
            ["corp.example", "link.edu"],
            "links are left alone, and so is the user's file"
        );
        forget_files(&dir.join("missing"), None); // no folder: nothing to do
        std::fs::remove_dir_all(&dir).unwrap();
    }
}
