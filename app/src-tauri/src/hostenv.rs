//! The Linux AppImage runs the app with its own libraries first (LD_LIBRARY_PATH, GTK_PATH, GIO_MODULE_DIR…). A
//! program a terminal starts, ssh above all, must get this computer's own: with the AppImage's older OpenSSL,
//! Fedora's ssh refuses its own system settings ("Unsupported KEX algorithm mlkem768x25519-sha256"). The same rule
//! as the backend's hpc_hub/core/hostenv.py: a path list loses the AppImage's entries (PATH keeps them, last, so the
//! app's own programs are still found), and a variable left empty goes.

const KEEP: [&str; 5] = ["APPDIR", "APPIMAGE", "ARGV0", "OWD", "HPC_HUB_RESOURCES"];

/// vars without the AppImage's folders; None when the app isn't an AppImage (nothing to change).
pub fn host(vars: &[(String, String)]) -> Option<Vec<(String, String)>> {
    let appdir = vars.iter().find(|(k, _)| k == "APPDIR").map(|(_, v)| v.clone()).filter(|v| !v.is_empty())?;
    let bundled = |p: &str| p.starts_with(&appdir) || p.starts_with("/tmp/.mount_") || p.starts_with("/tmp/_MEI");
    let mut env = Vec::new();
    for (key, value) in vars {
        if key.starts_with("_PYI_") || key == "LD_LIBRARY_PATH_ORIG" {
            continue;
        }
        if KEEP.contains(&key.as_str()) || !value.split(':').any(bundled) {
            env.push((key.clone(), value.clone()));
            continue;
        }
        let parts: Vec<&str> = value.split(':').filter(|p| !p.is_empty()).collect();
        let mut kept: Vec<&str> = parts.iter().copied().filter(|p| !bundled(p)).collect();
        if key == "PATH" {
            kept.extend(parts.iter().copied().filter(|p| bundled(p)));
        }
        if !kept.is_empty() {
            env.push((key.clone(), kept.join(":")));
        }
    }
    Some(env)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn vars(list: &[(&str, &str)]) -> Vec<(String, String)> {
        list.iter().map(|(k, v)| (k.to_string(), v.to_string())).collect()
    }

    #[test]
    fn the_appimage_libraries_go() {
        let got = host(&vars(&[
            ("APPDIR", "/tmp/.mount_HPC-Hub1"),
            ("LD_LIBRARY_PATH", "/tmp/.mount_HPC-Hub1/usr/lib/:/tmp/.mount_HPC-Hub1/lib/"),
            ("PATH", "/tmp/.mount_HPC-Hub1/usr/bin/:/home/jdoe/.local/bin:/usr/bin"),
            ("GIO_MODULE_DIR", "/tmp/.mount_HPC-Hub1/usr/lib/gio"),
            ("XDG_DATA_DIRS", "/tmp/.mount_HPC-Hub1/usr/share/:/usr/share"),
            ("HOME", "/home/jdoe"),
            ("LD_LIBRARY_PATH_ORIG", ""),
        ]))
        .unwrap();
        let get = |k: &str| got.iter().find(|(n, _)| n == k).map(|(_, v)| v.as_str());
        assert_eq!(get("LD_LIBRARY_PATH"), None);
        assert_eq!(get("GIO_MODULE_DIR"), None);
        assert_eq!(get("LD_LIBRARY_PATH_ORIG"), None);
        assert_eq!(get("PATH"), Some("/home/jdoe/.local/bin:/usr/bin:/tmp/.mount_HPC-Hub1/usr/bin/"));
        assert_eq!(get("XDG_DATA_DIRS"), Some("/usr/share"));
        assert_eq!(get("HOME"), Some("/home/jdoe"));
        assert_eq!(get("APPDIR"), Some("/tmp/.mount_HPC-Hub1"));
    }

    #[test]
    fn outside_an_appimage_nothing_changes() {
        assert!(host(&vars(&[("PATH", "/usr/bin"), ("LD_LIBRARY_PATH", "/opt/x/lib")])).is_none());
    }
}
