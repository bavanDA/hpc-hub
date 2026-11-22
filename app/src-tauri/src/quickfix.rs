//! Quick fixes (hpc_hub/core/quickfix.py downloads them): the window's files and the backend's Python for exactly
//! this version, kept in the app's data folder. The window's files come from the fix first, then from the build;
//! the backend gets the fix's Python through HPC_HUB_QUICKFIX_PY (packaging/backend.py).
//!
//! Nothing installed is trusted as it lies on disk: the data folder is yours to write, so anything there could have
//! been changed since it was installed. Every start checks the kept zip (fix.zip) against the update key again,
//! and that it is for this very version and number (its signed fix.json); the window's files are then served
//! from that checked zip, and py/ is put back the way the zip has it (changed files rewritten, others removed)
//! before the backend starts. A fix that doesn't check out is removed, and the build's own files are used.
//!
//! A fix that breaks the start never traps you: before using one, "starting" names it, and the window clears that
//! once it is up (quick_fix_started). Found still there at the next start, the fix is put on the "failed" list,
//! which the backend never offers again, and the build's own files are used.

use std::borrow::Cow;
use std::collections::HashMap;
use std::io::{Cursor, Read};
use std::path::{Component, Path, PathBuf};

use base64::Engine;
use base64::engine::general_purpose::STANDARD;

use tauri::utils::assets::{AssetKey, AssetsIter, CspHash};
use tauri::{Assets, Runtime};

const STARTING: &str = "starting";
const FAILED: &str = "failed";
const KEPT: &str = "fix.zip";
/// The update key's public half: plugins.updater.pubkey in tauri.conf.json (a test keeps them the same)
pub const PUBKEY: &str = "dW50cnVzdGVkIGNvbW1lbnQ6IG1pbmlzaWduIHB1YmxpYyBrZXk6IDlDOEU3QkFCQzNGMDgxMzQKUldRMGdmRERxM3VPbkw2d3BJY2xpenRuVFFmZjNhZW9xbTdYb1BpYSsrR1BlalBxWVA5ZURsQncK";
const MAX_FILE: u64 = 64 * 1024 * 1024;

/// A fix's files as its signed zip has them: ui/ and py/, by their path inside each.
#[derive(Default, Debug)]
pub struct Checked {
    pub ui: HashMap<String, Vec<u8>>,
    pub py: HashMap<String, Vec<u8>>,
}

fn unb64(text: &str) -> Result<String, String> {
    let bytes = STANDARD.decode(text.trim()).map_err(|_| "the signature can't be read")?;
    String::from_utf8(bytes).map_err(|_| "the signature can't be read".to_string())
}

/// data signed with the key, as `tauri signer sign` writes it (both base64 of the minisign text)
pub fn verify(data: &[u8], signature: &str, pubkey: &str) -> Result<(), String> {
    let key = minisign_verify::PublicKey::decode(&unb64(pubkey)?).map_err(|e| format!("the key: {e}"))?;
    let sig = minisign_verify::Signature::decode(&unb64(signature)?).map_err(|e| format!("the signature: {e}"))?;
    key.verify(data, &sig, false).map_err(|_| "the signature doesn't match".to_string())
}

fn safe(rel: &str) -> bool {
    !rel.is_empty() && !rel.contains('\\') && !rel.contains(':')
        && Path::new(rel).components().all(|c| matches!(c, Component::Normal(_)))
}

/// The zip's files, when it is signed with the key and its fix.json names this version and number.
pub fn check(data: &[u8], signature: &str, pubkey: &str, version: &str, number: u64) -> Result<Checked, String> {
    verify(data, signature, pubkey)?;
    let mut zip = zip::ZipArchive::new(Cursor::new(data)).map_err(|e| format!("not a zip: {e}"))?;
    let mut out = Checked::default();
    let mut meta = None;
    for i in 0..zip.len() {
        let mut f = zip.by_index(i).map_err(|e| e.to_string())?;
        if f.is_dir() {
            continue;
        }
        let name = f.name().map_err(|e| e.to_string())?.into_owned();
        if f.size() > MAX_FILE {
            return Err(format!("{name} is too big"));
        }
        let mut bytes = Vec::with_capacity(f.size() as usize);
        f.read_to_end(&mut bytes).map_err(|e| e.to_string())?;
        if name == "fix.json" {
            meta = Some(bytes);
        } else if let Some(rel) = name.strip_prefix("ui/").filter(|r| safe(r)) {
            out.ui.insert(rel.to_string(), bytes);
        } else if let Some(rel) = name.strip_prefix("py/").filter(|r| safe(r)) {
            out.py.insert(rel.to_string(), bytes);
        } else {
            return Err(format!("a file it shouldn't have: {name}"));
        }
    }
    let meta: serde_json::Value = serde_json::from_slice(&meta.ok_or("no fix.json")?).map_err(|e| e.to_string())?;
    let (base, n) = (meta.get("base").and_then(|v| v.as_str()), meta.get("number").and_then(|v| v.as_u64()));
    if base != Some(version) || n != Some(number) {
        return Err(format!("signed for {} fix {}, not {version} fix {number}", base.unwrap_or("?"), n.unwrap_or(0)));
    }
    Ok(out)
}

/// py/ on disk made exactly the zip's: files it doesn't have (a planted module, a __pycache__, a link) removed,
/// changed or missing ones written again.
pub fn restore(py: &Path, files: &HashMap<String, Vec<u8>>) -> std::io::Result<()> {
    fn clean(dir: &Path, rel: &str, files: &HashMap<String, Vec<u8>>) -> std::io::Result<()> {
        for entry in std::fs::read_dir(dir)? {
            let entry = entry?;
            let name = entry.file_name().to_string_lossy().into_owned();
            let here = if rel.is_empty() { name } else { format!("{rel}/{name}") };
            let path = entry.path();
            let kind = std::fs::symlink_metadata(&path)?.file_type();
            if kind.is_dir() {
                clean(&path, &here, files)?;
                let _ = std::fs::remove_dir(&path); // only when nothing is left in it
            } else if !(kind.is_file() && files.contains_key(&here)) {
                std::fs::remove_file(&path)?;
            }
        }
        Ok(())
    }
    if std::fs::symlink_metadata(py).map(|m| !m.is_dir()).unwrap_or(false) {
        std::fs::remove_file(py)?;
    }
    std::fs::create_dir_all(py)?;
    clean(py, "", files)?;
    for (rel, bytes) in files {
        let path = py.join(rel);
        if std::fs::read(&path).map(|b| &b != bytes).unwrap_or(true) {
            if let Some(dir) = path.parent() {
                std::fs::create_dir_all(dir)?;
            }
            std::fs::write(&path, bytes)?;
        }
    }
    Ok(())
}

/// The fix in dir checked, and its py/ restored; Err says why it can't be used.
fn checked(dir: &Path, version: &str, number: u64, pubkey: &str) -> Result<Checked, String> {
    let data = std::fs::read(dir.join(KEPT)).map_err(|_| "its zip isn't kept (installed by an older version)")?;
    let sig = std::fs::read_to_string(dir.join(format!("{KEPT}.sig"))).map_err(|_| "no signature kept")?;
    let fix = check(&data, &sig, pubkey, version, number)?;
    restore(&dir.join("py"), &fix.py).map_err(|e| format!("its files can't be put back: {e}"))?;
    Ok(fix)
}

pub struct QuickFix {
    pub root: PathBuf,
    pub version: String,
    /// The fix in use: its number and folder
    pub using: Option<(u64, PathBuf)>,
    /// its window files, from the checked zip
    ui: HashMap<String, Vec<u8>>,
}

impl QuickFix {
    /// Which fix to use for this start, if any. Release builds only; a debug build serves the dev server.
    pub fn choose(identifier: &str, version: &str) -> Option<QuickFix> {
        if cfg!(debug_assertions) {
            return None;
        }
        let root = dirs::data_dir()?.join(identifier).join("quick-fix");
        let (using, ui) = match pick(&root, version, PUBKEY) {
            Some((n, dir, fix)) => (Some((n, dir)), fix.ui),
            None => (None, HashMap::new()),
        };
        Some(QuickFix { root, version: version.to_string(), using, ui })
    }

    pub fn backend_env(&self) -> Vec<(&'static str, String)> {
        let mut env = vec![
            ("HPC_HUB_QUICKFIX_DIR", self.root.display().to_string()),
            ("HPC_HUB_APP_VERSION", self.version.clone()),
        ];
        if let Some((n, dir)) = &self.using {
            env.push(("HPC_HUB_QUICKFIX_PY", dir.join("py").display().to_string()));
            env.push(("HPC_HUB_QUICKFIX_NUMBER", n.to_string()));
        }
        env
    }
}

fn pick(root: &Path, version: &str, pubkey: &str) -> Option<(u64, PathBuf, Checked)> {
    let text = std::fs::read_to_string(root.join("current.json")).ok()?;
    let cur: serde_json::Value = serde_json::from_str(&text).ok()?;
    if cur.get("base")?.as_str()? != version {
        return None;
    }
    let n = cur.get("number")?.as_u64()?;
    let dir = root.join(n.to_string());
    if !dir.is_dir() {
        return None;
    }
    let fix = match checked(&dir, version, n, pubkey) {
        Ok(fix) => fix,
        Err(why) => {
            eprintln!("hpc-hub: quick fix {n} not used: {why}");
            let _ = std::fs::remove_file(root.join("current.json"));
            let _ = std::fs::remove_dir_all(&dir);
            return None;
        }
    };
    let starting = root.join(STARTING);
    if std::fs::read_to_string(&starting).ok().as_deref().map(str::trim) == Some(&n.to_string()) {
        // the last start with this fix never got going
        let failed = std::fs::read_to_string(root.join(FAILED)).unwrap_or_default();
        let _ = std::fs::write(root.join(FAILED), format!("{failed}{n}\n"));
        let _ = std::fs::remove_file(root.join("current.json"));
        let _ = std::fs::remove_file(&starting);
        return None;
    }
    std::fs::write(&starting, n.to_string()).ok()?;
    Some((n, dir, fix))
}

/// The window is up: the fix in use works well enough to keep.
#[tauri::command]
pub fn quick_fix_started(fix: tauri::State<Option<QuickFix>>) {
    if let Some(fix) = fix.inner() {
        let _ = std::fs::remove_file(fix.root.join(STARTING));
    }
}

/// The build's own files, with the fix's ui/ (from its checked zip, never read from disk) in front.
pub struct FixAssets<R: Runtime> {
    pub inner: Box<dyn Assets<R>>,
    pub ui: HashMap<String, Vec<u8>>,
}

impl<R: Runtime> Assets<R> for FixAssets<R> {
    fn setup(&self, app: &tauri::App<R>) {
        self.inner.setup(app)
    }

    fn get(&self, key: &AssetKey) -> Option<Cow<'_, [u8]>> {
        if let Some(bytes) = self.ui.get(key.as_ref().trim_start_matches('/')) {
            return Some(Cow::Borrowed(bytes.as_slice()));
        }
        self.inner.get(key)
    }

    fn iter(&self) -> Box<AssetsIter<'_>> {
        self.inner.iter()
    }

    fn csp_hashes(&self, html_path: &AssetKey) -> Box<dyn Iterator<Item = CspHash<'_>> + '_> {
        self.inner.csp_hashes(html_path)
    }
}

/// Holds the place of the build's files for a moment, while they move into FixAssets.
struct NoAssets;

impl<R: Runtime> Assets<R> for NoAssets {
    fn get(&self, _key: &AssetKey) -> Option<Cow<'_, [u8]>> {
        None
    }

    fn iter(&self) -> Box<AssetsIter<'_>> {
        Box::new(std::iter::empty())
    }

    fn csp_hashes(&self, _html_path: &AssetKey) -> Box<dyn Iterator<Item = CspHash<'_>> + '_> {
        Box::new(std::iter::empty())
    }
}

/// The fix to use for this start, with the window's files from it when it has any.
pub fn apply<R: Runtime>(context: &mut tauri::Context<R>) -> Option<QuickFix> {
    let mut fix = QuickFix::choose(&context.config().identifier, &context.package_info().version.to_string())?;
    if fix.using.is_some() && fix.ui.contains_key("index.html") {
        let ui = std::mem::take(&mut fix.ui);
        let inner = context.set_assets(Box::new(NoAssets));
        context.set_assets(Box::new(FixAssets { inner, ui }));
    }
    Some(fix)
}

#[cfg(test)]
mod tests {
    use super::*;

    const TEST_KEY: &str = include_str!("testdata/quickfix/test.pub");
    const V: &str = "1.0.0-beta.1";

    fn zip(name: &str) -> (Vec<u8>, String) {
        let dir = Path::new(env!("CARGO_MANIFEST_DIR")).join("src/testdata/quickfix");
        (std::fs::read(dir.join(name)).unwrap(), std::fs::read_to_string(dir.join(format!("{name}.sig"))).unwrap())
    }

    /// A quick-fix folder as quickfix.py installs one: <n>/ with py/ unpacked, the zip and its .sig kept.
    fn installed(root: &Path, n: u64, from: &str) -> PathBuf {
        let (data, sig) = zip(from);
        let dir = root.join(n.to_string());
        let fix = check(&data, &sig, TEST_KEY, V, n).unwrap_or_default();
        restore(&dir.join("py"), &fix.py).unwrap();
        std::fs::write(dir.join(KEPT), &data).unwrap();
        std::fs::write(dir.join(format!("{KEPT}.sig")), &sig).unwrap();
        std::fs::write(root.join("current.json"), format!("{{\"base\":\"{V}\",\"number\":{n}}}")).unwrap();
        dir
    }

    fn tmp(name: &str) -> PathBuf {
        let d = std::env::temp_dir().join(format!("hpchub-qf-{name}-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&d);
        std::fs::create_dir_all(&d).unwrap();
        d
    }

    #[test]
    fn the_key_is_the_update_key() {
        let conf: serde_json::Value = serde_json::from_str(include_str!("../tauri.conf.json")).unwrap();
        assert_eq!(conf["plugins"]["updater"]["pubkey"].as_str(), Some(PUBKEY));
    }

    #[test]
    fn a_signed_zip_for_this_version_and_number_is_taken() {
        let (data, sig) = zip("fix-4.zip");
        let fix = check(&data, &sig, TEST_KEY, V, 4).unwrap();
        assert_eq!(fix.ui["index.html"], b"<html>fixed</html>");
        assert!(fix.ui.contains_key("assets/a.js"));
        assert_eq!(fix.py["hpc_hub/core/m.py"], b"x = 1\n");
    }

    #[test]
    fn a_changed_byte_or_another_key_is_refused() {
        let (mut data, sig) = zip("fix-4.zip");
        assert!(check(&data, &sig, PUBKEY, V, 4).is_err(), "signed with the test key, not the update key");
        let last = data.len() - 30;
        data[last] ^= 1;
        assert!(check(&data, &sig, TEST_KEY, V, 4).is_err());
        assert!(check(&zip("fix-4.zip").0, "not a signature", TEST_KEY, V, 4).is_err());
    }

    #[test]
    fn an_old_signed_zip_cant_pass_for_a_newer_fix_or_another_version() {
        let (data, sig) = zip("fix-3.zip"); // genuinely signed, but for fix 3
        assert!(check(&data, &sig, TEST_KEY, V, 3).is_ok());
        assert!(check(&data, &sig, TEST_KEY, V, 4).unwrap_err().contains("not 1.0.0-beta.1 fix 4"));
        assert!(check(&data, &sig, TEST_KEY, "1.0.0-beta.2", 3).is_err());
        let (data, sig) = zip("no-meta.zip"); // signed, says nothing of what it is for
        assert!(check(&data, &sig, TEST_KEY, V, 4).unwrap_err().contains("fix.json"));
    }

    #[test]
    fn a_zip_with_files_outside_ui_and_py_is_refused() {
        let (data, sig) = zip("outside.zip");
        assert!(check(&data, &sig, TEST_KEY, V, 4).unwrap_err().contains("bin/evil"));
    }

    #[test]
    fn py_on_disk_is_put_back_the_way_the_zip_has_it() {
        let root = tmp("restore");
        let dir = installed(&root, 4, "fix-4.zip");
        let py = dir.join("py");
        std::fs::write(py.join("hpc_hub/core/m.py"), "import os; os.system('x')\n").unwrap(); // changed
        std::fs::write(py.join("hpc_hub/planted.py"), "x").unwrap(); // added
        std::fs::create_dir_all(py.join("hpc_hub/__pycache__")).unwrap();
        std::fs::write(py.join("hpc_hub/__pycache__/m.cpython-313.pyc"), "x").unwrap(); // a crafted cache
        std::fs::remove_file(py.join("hpc_hub/__init__.py")).unwrap(); // removed
        let (n, _, fix) = pick(&root, V, TEST_KEY).unwrap();
        assert_eq!(n, 4);
        assert_eq!(std::fs::read(py.join("hpc_hub/core/m.py")).unwrap(), b"x = 1\n");
        assert!(py.join("hpc_hub/__init__.py").is_file());
        assert!(!py.join("hpc_hub/planted.py").exists() && !py.join("hpc_hub/__pycache__").exists());
        assert_eq!(fix.ui["index.html"], b"<html>fixed</html>");
        let _ = std::fs::remove_dir_all(&root);
    }

    #[cfg(unix)]
    #[test]
    fn a_link_in_py_is_removed_not_followed() {
        let root = tmp("link");
        let dir = installed(&root, 4, "fix-4.zip");
        let outside = root.join("outside");
        std::fs::create_dir_all(&outside).unwrap();
        std::fs::remove_dir_all(dir.join("py/hpc_hub/core")).unwrap();
        std::os::unix::fs::symlink(&outside, dir.join("py/hpc_hub/core")).unwrap();
        assert!(pick(&root, V, TEST_KEY).is_some());
        assert!(dir.join("py/hpc_hub/core").is_dir() && !std::fs::symlink_metadata(dir.join("py/hpc_hub/core")).unwrap().file_type().is_symlink());
        assert_eq!(std::fs::read_dir(&outside).unwrap().count(), 0, "nothing written through the link");
        let _ = std::fs::remove_dir_all(&root);
    }

    #[test]
    fn a_fix_that_doesnt_check_out_is_removed_and_the_build_runs() {
        let root = tmp("bad");
        let dir = installed(&root, 4, "fix-4.zip");
        let mut data = std::fs::read(dir.join(KEPT)).unwrap();
        let last = data.len() - 30;
        data[last] ^= 1;
        std::fs::write(dir.join(KEPT), data).unwrap();
        assert!(pick(&root, V, TEST_KEY).is_none());
        assert!(!dir.exists() && !root.join("current.json").exists());
        assert!(!root.join(STARTING).exists());

        let dir = installed(&root, 5, "fix-4.zip"); // a zip signed for fix 4, put in as fix 5
        assert!(pick(&root, V, TEST_KEY).is_none() && !dir.exists());

        let dir = installed(&root, 4, "fix-4.zip"); // installed by an older version: no zip kept
        std::fs::remove_file(dir.join(KEPT)).unwrap();
        assert!(pick(&root, V, TEST_KEY).is_none());
        let _ = std::fs::remove_dir_all(&root);
    }

    #[test]
    fn a_good_fix_is_marked_starting() {
        let root = tmp("good");
        installed(&root, 4, "fix-4.zip");
        assert!(pick(&root, V, TEST_KEY).is_some());
        assert_eq!(std::fs::read_to_string(root.join(STARTING)).unwrap(), "4");
        assert!(pick(&root, V, TEST_KEY).is_none(), "a start that never got going drops it");
        assert_eq!(std::fs::read_to_string(root.join(FAILED)).unwrap(), "4\n");
        let _ = std::fs::remove_dir_all(&root);
    }

    #[test]
    fn the_window_files_come_from_the_checked_zip_not_the_disk() {
        let mut ui = HashMap::new();
        ui.insert("index.html".to_string(), b"<html>fixed</html>".to_vec());
        let assets: FixAssets<tauri::Wry> = FixAssets { inner: Box::new(NoAssets), ui };
        assert_eq!(assets.get(&AssetKey::from("/index.html")).as_deref(), Some(&b"<html>fixed</html>"[..]));
        assert!(assets.get(&AssetKey::from("/../secret")).is_none());
        let src = include_str!("quickfix.rs");
        let get = &src[src.find("fn get(&self, key: &AssetKey)").unwrap()..];
        assert!(!get[..get.find("fn iter").unwrap()].contains("fs::read"), "never read from disk");
    }
}
