//! `install` and `uninstall`: copy the helper and openconnect into the admin-owned folder, write config.json,
//! register the service (Windows) or launchd daemon (macOS) and start it.

use std::fs::{self, File};
use std::io;
use std::path::{Path, PathBuf};

use crate::config::Config;
use crate::options;
use crate::paths::{CONFIG, HELPER};

pub struct Install {
    pub users: Vec<String>,
    pub gateways: Vec<String>,
    pub from: PathBuf,
}

pub fn parse(args: &[String]) -> Result<Install, String> {
    let mut a = Install { users: vec![], gateways: vec![], from: PathBuf::new() };
    for (name, value) in options(args, &["user", "gateway", "from"])? {
        match name.as_str() {
            "user" => a.users.push(value),
            "gateway" => a.gateways.push(value),
            _ => a.from = PathBuf::from(value),
        }
    }
    if a.users.is_empty() || a.gateways.is_empty() || a.from.as_os_str().is_empty() {
        return Err("install needs --user, --gateway and --from".into());
    }
    Ok(a)
}

/// Copy the contents of `from` into `to`, following symlinks (we copy what they point at), skipping the helper
/// itself at the top (the running one is written separately).
pub fn copy_tree(from: &Path, to: &Path, depth: u32) -> io::Result<()> {
    if depth > 16 {
        return Err(io::Error::other(format!("{} is nested too deep", from.display())));
    }
    fs::create_dir_all(to)?;
    for entry in fs::read_dir(from)? {
        let entry = entry?;
        let name = entry.file_name();
        if depth == 0 && (name == HELPER || name == CONFIG) {
            continue;
        }
        let (src, dst) = (entry.path(), to.join(&name));
        let meta = fs::metadata(&src)?;
        if meta.is_dir() {
            copy_tree(&src, &dst, depth + 1)?;
        } else if meta.is_file() {
            copy_file(&src, &dst, &meta)?;
        }
    }
    Ok(())
}

/// Content only: no ACLs, xattrs (quarantine) or alternate streams. Keeps the exec bit on Unix.
fn copy_file(src: &Path, dst: &Path, meta: &fs::Metadata) -> io::Result<()> {
    io::copy(&mut File::open(src)?, &mut File::create(dst)?)?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let mode = if meta.permissions().mode() & 0o111 != 0 { 0o755 } else { 0o644 };
        fs::set_permissions(dst, fs::Permissions::from_mode(mode))?;
    }
    #[cfg(not(unix))]
    let _ = meta;
    Ok(())
}

/// The running helper, read before anything is replaced (install may run from the install folder).
fn this_program() -> Result<Vec<u8>, String> {
    let me = std::env::current_exe().map_err(|e| format!("Can't find this program: {e}"))?;
    fs::read(&me).map_err(|e| format!("Can't read {}: {e}", me.display()))
}

fn need_openconnect(from: &Path) -> Result<(), String> {
    let oc = crate::openconnect::program(from);
    if !oc.is_file() {
        return Err(format!("{} is missing", oc.display()));
    }
    Ok(())
}

/// Remove `dir` (or a symlink in its place) if it is there.
fn remove_dir(dir: &Path) -> io::Result<()> {
    match fs::symlink_metadata(dir) {
        Ok(m) if m.is_dir() => fs::remove_dir_all(dir),
        Ok(_) => fs::remove_file(dir),
        Err(e) if e.kind() == io::ErrorKind::NotFound => Ok(()),
        Err(e) => Err(e),
    }
}

/// Copy everything into `dir` (fresh) and write config.json.
fn fill(dir: &Path, from: &Path, me: &[u8], config: &Config) -> Result<(), String> {
    copy_tree(from, dir, 0).map_err(|e| format!("Can't copy {}: {e}", from.display()))?;
    let helper = dir.join(HELPER);
    fs::write(&helper, me).map_err(|e| format!("Can't write {}: {e}", helper.display()))?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        fs::set_permissions(&helper, fs::Permissions::from_mode(0o755)).map_err(|e| e.to_string())?;
    }
    let cfg = dir.join(CONFIG);
    fs::write(&cfg, config.to_json()).map_err(|e| format!("Can't write {}: {e}", cfg.display()))
}

#[cfg(target_os = "macos")]
mod platform {
    use std::fs;
    use std::os::unix::fs::{FileTypeExt, PermissionsExt, chown};
    use std::path::Path;
    use std::process::Command;

    use super::{Install, fill, need_openconnect, remove_dir, this_program};
    use crate::config::Config;
    use crate::paths::{CONFIG, DIR, ENDPOINT, HELPER};

    const LABEL: &str = "org.hpchub.vpn";
    const PLIST: &str = "/Library/LaunchDaemons/org.hpchub.vpn.plist";

    fn need_root() -> Result<(), String> {
        if unsafe { libc::geteuid() } != 0 {
            return Err("this must run as root (the app asks for your password)".into());
        }
        Ok(())
    }

    fn launchctl(args: &[&str]) -> Result<(), String> {
        let out = Command::new("/bin/launchctl").args(args).output().map_err(|e| format!("launchctl: {e}"))?;
        if out.status.success() {
            return Ok(());
        }
        let err = String::from_utf8_lossy(&out.stderr);
        Err(format!("launchctl {} failed: {}", args[0], err.lines().next().unwrap_or("").trim()))
    }

    fn xml(s: &str) -> String {
        s.replace('&', "&amp;").replace('<', "&lt;").replace('>', "&gt;")
    }

    fn plist(helper: &str) -> String {
        format!(
            r#"<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>{LABEL}</string>
  <key>ProgramArguments</key>
  <array><string>{}</string><string>serve</string></array>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
</dict>
</plist>
"#,
            xml(helper)
        )
    }

    /// root:wheel everywhere; folders 0755, config.json 0600 (files keep the mode the copy gave them).
    fn lock_down(path: &Path) -> std::io::Result<()> {
        let meta = fs::symlink_metadata(path)?;
        chown(path, Some(0), Some(0))?;
        if meta.is_dir() {
            fs::set_permissions(path, fs::Permissions::from_mode(0o755))?;
            for entry in fs::read_dir(path)? {
                lock_down(&entry?.path())?;
            }
        } else if path.file_name().is_some_and(|n| n == CONFIG) {
            fs::set_permissions(path, fs::Permissions::from_mode(0o600))?;
        }
        Ok(())
    }

    pub fn install(a: Install) -> Result<(), String> {
        need_root()?;
        let config = Config::new(a.users, a.gateways)?;
        need_openconnect(&a.from)?;
        let me = this_program()?;
        let _ = launchctl(&["bootout", &format!("system/{LABEL}")]); // the old one, if loaded

        let dir = Path::new(DIR);
        remove_dir(dir).map_err(|e| format!("Can't remove the old {DIR}: {e}"))?;
        fs::create_dir_all(dir).map_err(|e| format!("Can't create {DIR}: {e}"))?;
        fs::set_permissions(dir, fs::Permissions::from_mode(0o700)).map_err(|e| e.to_string())?;
        fill(dir, &a.from, &me, &config)?;
        lock_down(dir).map_err(|e| format!("Can't set the owner of {DIR}: {e}"))?;

        let tmp = format!("{PLIST}.tmp");
        let helper = dir.join(HELPER);
        fs::write(&tmp, plist(&helper.to_string_lossy())).map_err(|e| format!("Can't write {PLIST}: {e}"))?;
        chown(&tmp, Some(0), Some(0)).map_err(|e| e.to_string())?;
        fs::set_permissions(&tmp, fs::Permissions::from_mode(0o644)).map_err(|e| e.to_string())?;
        fs::rename(&tmp, PLIST).map_err(|e| format!("Can't write {PLIST}: {e}"))?;
        launchctl(&["bootstrap", "system", PLIST])
    }

    pub fn uninstall() -> Result<(), String> {
        need_root()?;
        let _ = launchctl(&["bootout", &format!("system/{LABEL}")]);
        match fs::remove_file(PLIST) {
            Err(e) if e.kind() != std::io::ErrorKind::NotFound => return Err(format!("Can't remove {PLIST}: {e}")),
            _ => {}
        }
        remove_dir(Path::new(DIR)).map_err(|e| format!("Can't remove {DIR}: {e}"))?;
        if fs::symlink_metadata(ENDPOINT).is_ok_and(|m| m.file_type().is_socket()) {
            let _ = fs::remove_file(ENDPOINT);
        }
        Ok(())
    }

    #[cfg(test)]
    mod tests {
        #[test]
        fn plist_has_the_helper() {
            let p = super::plist("/Library/Application Support/HPC Hub VPN/hpc-hub-vpn-helper");
            assert!(p.contains("<string>/Library/Application Support/HPC Hub VPN/hpc-hub-vpn-helper</string>"));
            assert!(p.contains("<key>KeepAlive</key><true/>"));
        }
    }
}

#[cfg(windows)]
mod platform {
    use std::ffi::{OsStr, OsString};
    use std::fs;
    use std::path::{Path, PathBuf};
    use std::process::Command;
    use std::thread::sleep;
    use std::time::{Duration, Instant};

    use windows_service::service::{
        ServiceAccess, ServiceAction, ServiceActionType, ServiceErrorControl, ServiceFailureActions,
        ServiceFailureResetPeriod, ServiceInfo, ServiceStartType, ServiceState, ServiceType,
    };
    use windows_service::service_manager::{ServiceManager, ServiceManagerAccess};
    use windows_sys::Win32::Foundation::{ERROR_SERVICE_DOES_NOT_EXIST, ERROR_SERVICE_MARKED_FOR_DELETE};

    use super::{Install, fill, need_openconnect, remove_dir, this_program};
    use crate::config::Config;
    use crate::paths::{DIR, HELPER};
    use crate::windows::{SERVICE, is_elevated};

    fn need_admin() -> Result<(), String> {
        if !is_elevated() {
            return Err("this must run as administrator (the app asks Windows for permission)".into());
        }
        Ok(())
    }

    fn os_error(e: &windows_service::Error) -> Option<u32> {
        match e {
            windows_service::Error::Winapi(io) => io.raw_os_error().map(|c| c as u32),
            _ => None,
        }
    }

    /// Retry `f` for a while: files stay locked for a moment after the service and openconnect stop.
    fn retry<T>(what: &str, mut f: impl FnMut() -> std::io::Result<T>) -> Result<T, String> {
        let end = Instant::now() + Duration::from_secs(15);
        loop {
            match f() {
                Ok(v) => return Ok(v),
                Err(e) if Instant::now() >= end => return Err(format!("{what}: {e}")),
                Err(_) => sleep(Duration::from_millis(500)),
            }
        }
    }

    /// Stop and delete the old service, if there is one.
    fn remove_service(manager: &ServiceManager) -> Result<(), String> {
        let access = ServiceAccess::QUERY_STATUS | ServiceAccess::STOP | ServiceAccess::DELETE;
        let service = match manager.open_service(SERVICE, access) {
            Ok(s) => s,
            Err(e) if os_error(&e) == Some(ERROR_SERVICE_DOES_NOT_EXIST) => return Ok(()),
            Err(e) => return Err(format!("Can't open the old service: {e}")),
        };
        let _ = service.stop();
        let end = Instant::now() + Duration::from_secs(30);
        while Instant::now() < end {
            match service.query_status() {
                Ok(s) if s.current_state != ServiceState::Stopped => sleep(Duration::from_millis(300)),
                _ => break,
            }
        }
        match service.delete() {
            Err(e) if os_error(&e) != Some(ERROR_SERVICE_MARKED_FOR_DELETE) => {
                Err(format!("Can't delete the old service: {e}"))
            }
            _ => Ok(()),
        }
    }

    /// Admins and SYSTEM may change the folder, Users may only read and run it. Nothing inherited.
    fn lock_down(dir: &Path) -> Result<(), String> {
        let root = std::env::var_os("SystemRoot").unwrap_or_else(|| OsString::from(r"C:\Windows"));
        let icacls = PathBuf::from(root).join("System32").join("icacls.exe");
        let out = Command::new(icacls)
            .arg(dir)
            .args(["/inheritance:r", "/grant:r", "*S-1-5-18:(OI)(CI)F", "*S-1-5-32-544:(OI)(CI)F"])
            .args(["*S-1-5-32-545:(OI)(CI)RX", "/Q"])
            .output()
            .map_err(|e| format!("icacls: {e}"))?;
        if !out.status.success() {
            let text = String::from_utf8_lossy(&out.stdout) + String::from_utf8_lossy(&out.stderr);
            return Err(format!("icacls failed: {}", text.lines().find(|l| !l.trim().is_empty()).unwrap_or("")));
        }
        Ok(())
    }

    fn create_service(manager: &ServiceManager, dir: &Path) -> Result<(), String> {
        let info = ServiceInfo {
            name: OsString::from(SERVICE),
            display_name: OsString::from("HPC Hub VPN"),
            service_type: ServiceType::OWN_PROCESS,
            start_type: ServiceStartType::AutoStart,
            error_control: ServiceErrorControl::Normal,
            executable_path: dir.join(HELPER),
            launch_arguments: vec![OsString::from("serve")],
            dependencies: vec![],
            account_name: None, // LocalSystem
            account_password: None,
        };
        let access = ServiceAccess::START | ServiceAccess::CHANGE_CONFIG | ServiceAccess::QUERY_STATUS;
        let end = Instant::now() + Duration::from_secs(15);
        let service = loop {
            match manager.create_service(&info, access) {
                Ok(s) => break s,
                // the old one goes once nothing holds it open any more
                Err(e) if os_error(&e) == Some(ERROR_SERVICE_MARKED_FOR_DELETE) && Instant::now() < end => {
                    sleep(Duration::from_millis(500))
                }
                Err(e) => return Err(format!("Can't create the service: {e}")),
            }
        };
        let _ = service.set_description("Runs the VPN tunnel for HPC Hub (openconnect), for the gateways it was set up for.");
        let restart = ServiceAction { action_type: ServiceActionType::Restart, delay: Duration::from_secs(5) };
        let _ = service.update_failure_actions(ServiceFailureActions {
            reset_period: ServiceFailureResetPeriod::After(Duration::from_secs(86400)),
            reboot_msg: None,
            command: None,
            actions: Some(vec![restart.clone(), restart.clone(), restart]),
        });
        service.start(&[] as &[&OsStr]).map_err(|e| format!("Can't start the service: {e}"))
    }

    pub fn install(a: Install) -> Result<(), String> {
        need_admin()?;
        let config = Config::new(a.users, a.gateways)?;
        need_openconnect(&a.from)?;
        let me = this_program()?;
        let access = ServiceManagerAccess::CONNECT | ServiceManagerAccess::CREATE_SERVICE;
        let manager = ServiceManager::local_computer(None::<&str>, access)
            .map_err(|e| format!("Can't open the service manager: {e}"))?;
        remove_service(&manager)?;

        let dir = Path::new(DIR);
        retry(&format!("Can't remove the old {DIR}"), || remove_dir(dir))?;
        fs::create_dir_all(dir).map_err(|e| format!("Can't create {DIR}: {e}"))?;
        lock_down(dir)?; // before the copy, so every file inherits it
        fill(dir, &a.from, &me, &config)?;
        create_service(&manager, dir)
    }

    pub fn uninstall() -> Result<(), String> {
        need_admin()?;
        let manager = ServiceManager::local_computer(None::<&str>, ServiceManagerAccess::CONNECT)
            .map_err(|e| format!("Can't open the service manager: {e}"))?;
        remove_service(&manager)?;
        retry(&format!("Can't remove {DIR}"), || remove_dir(Path::new(DIR)))
    }
}

#[cfg(not(any(target_os = "macos", windows)))]
mod platform {
    use super::Install;

    pub fn install(a: Install) -> Result<(), String> {
        let _ = (super::fill, super::need_openconnect, super::remove_dir, super::this_program);
        crate::config::Config::new(a.users, a.gateways)?;
        Err("install is for Windows and macOS".into())
    }

    pub fn uninstall() -> Result<(), String> {
        Err("uninstall is for Windows and macOS".into())
    }
}

pub use platform::{install, uninstall};

#[cfg(test)]
mod tests {
    use super::*;

    fn s(v: &[&str]) -> Vec<String> {
        v.iter().map(|x| x.to_string()).collect()
    }

    #[test]
    fn parses_install() {
        let a = parse(&s(&["--user", "4242", "--gateway", "vpn.example.edu", "--gateway", "b.example.org", "--from", "/r/vpn"]))
            .unwrap();
        assert_eq!(a.users, ["4242"]);
        assert_eq!(a.gateways, ["vpn.example.edu", "b.example.org"]);
        assert_eq!(a.from, PathBuf::from("/r/vpn"));
        assert!(parse(&s(&["--user", "4242", "--from", "/r"])).is_err());
        assert!(parse(&s(&["--gateway", "g", "--from", "/r"])).is_err());
        assert!(parse(&s(&["--user", "4242", "--gateway", "g"])).is_err());
    }

    #[test]
    fn copies_a_tree() {
        let base = std::env::temp_dir().join(format!("hpchub-copy-{}", std::process::id()));
        let (from, to) = (base.join("from"), base.join("to"));
        fs::create_dir_all(from.join("openconnect/lib")).unwrap();
        fs::write(from.join("openconnect/openconnect"), "bin").unwrap();
        fs::write(from.join("openconnect/lib/libx.dylib"), "lib").unwrap();
        fs::write(from.join(HELPER), "old helper").unwrap();
        copy_tree(&from, &to, 0).unwrap();
        assert_eq!(fs::read_to_string(to.join("openconnect/lib/libx.dylib")).unwrap(), "lib");
        assert!(!to.join(HELPER).exists(), "the helper is written from the running program instead");
        fs::remove_dir_all(&base).unwrap();
    }
}
