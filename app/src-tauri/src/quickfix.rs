//! Quick fixes (hpc_hub/core/quickfix.py downloads them): the window's files and the backend's Python for exactly
//! this version, kept in the app's data folder. The window's files come from the fix first, then from the build;
//! the backend gets the fix's Python through HPC_HUB_QUICKFIX_PY (packaging/backend.py).
//!
//! A fix that breaks the start never traps you: before using one, "starting" names it, and the window clears that
//! once it is up (quick_fix_started). Found still there at the next start, the fix is put on the "failed" list,
//! which the backend never offers again, and the build's own files are used.

use std::borrow::Cow;
use std::path::{Component, Path, PathBuf};

use tauri::utils::assets::{AssetKey, AssetsIter, CspHash};
use tauri::{Assets, Runtime};

const STARTING: &str = "starting";
const FAILED: &str = "failed";

pub struct QuickFix {
    pub root: PathBuf,
    pub version: String,
    /// The fix in use: its number and folder
    pub using: Option<(u64, PathBuf)>,
}

impl QuickFix {
    /// Which fix to use for this start, if any. Release builds only; a debug build serves the dev server.
    pub fn choose(identifier: &str, version: &str) -> Option<QuickFix> {
        if cfg!(debug_assertions) {
            return None;
        }
        let root = dirs::data_dir()?.join(identifier).join("quick-fix");
        let using = pick(&root, version);
        Some(QuickFix { root, version: version.to_string(), using })
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

fn pick(root: &Path, version: &str) -> Option<(u64, PathBuf)> {
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
    Some((n, dir))
}

/// The window is up: the fix in use works well enough to keep.
#[tauri::command]
pub fn quick_fix_started(fix: tauri::State<Option<QuickFix>>) {
    if let Some(fix) = fix.inner() {
        let _ = std::fs::remove_file(fix.root.join(STARTING));
    }
}

/// The build's own files, with the fix's ui/ in front.
pub struct FixAssets<R: Runtime> {
    pub inner: Box<dyn Assets<R>>,
    pub ui: PathBuf,
}

impl<R: Runtime> Assets<R> for FixAssets<R> {
    fn setup(&self, app: &tauri::App<R>) {
        self.inner.setup(app)
    }

    fn get(&self, key: &AssetKey) -> Option<Cow<'_, [u8]>> {
        let rel = Path::new(key.as_ref().trim_start_matches('/'));
        if rel.components().all(|c| matches!(c, Component::Normal(_))) {
            if let Ok(bytes) = std::fs::read(self.ui.join(rel)) {
                return Some(Cow::Owned(bytes));
            }
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
    let fix = QuickFix::choose(&context.config().identifier, &context.package_info().version.to_string())?;
    if let Some((_, dir)) = &fix.using {
        let ui = dir.join("ui");
        if ui.join("index.html").is_file() {
            let inner = context.set_assets(Box::new(NoAssets));
            context.set_assets(Box::new(FixAssets { inner, ui }));
        }
    }
    Some(fix)
}
