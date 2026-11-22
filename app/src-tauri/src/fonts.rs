//! Linux AppImage: no COLRv1 emoji fonts in the window. The WebKit the AppImage brings aborts while drawing some
//! COLRv1 color glyphs (Skia's colrv1_configure_skpaint: "Assertion '__n < this->size()' failed"), and the whole
//! window goes with it (2026-11-22, the owner's Fedora 44 laptop, whose only color emoji font is Noto-COLRv1.ttf).
//! The AppImage uses the system's fontconfig, so a small config that includes the usual one and rejects those font
//! files keeps them out; emoji then come from the system's other emoji fonts. Set HPC_HUB_COLOR_EMOJI=1 to keep them.

use std::path::{Path, PathBuf};

/// Font files left out: COLRv1 builds name themselves so (Fedora's Noto-COLRv1.ttf, Noto-COLRv1-noflags.ttf).
pub const REJECT: &str = "*COLRv1*";
const SYSTEM: &str = "/etc/fonts/fonts.conf";

fn xml(s: &str) -> String {
    s.replace('&', "&amp;").replace('<', "&lt;").replace('>', "&gt;").replace('"', "&quot;")
}

/// The config: everything the base config says, without the COLRv1 files.
pub fn config(base: &str) -> String {
    format!("<?xml version=\"1.0\"?>\n<!DOCTYPE fontconfig SYSTEM \"urn:fontconfig:fonts.dtd\">\n<fontconfig>\n  \
             <include ignore_missing=\"no\">{}</include>\n  \
             <selectfont><rejectfont><glob>{REJECT}</glob></rejectfont></selectfont>\n</fontconfig>\n", xml(base))
}

/// Where the config goes and what it says; None when nothing should change: not an AppImage, you asked to keep
/// the fonts, or the base config isn't there (fontconfig would then find no fonts at all).
pub fn plan(appimage: bool, keep: bool, current: Option<&str>, cache: &Path, exists: impl Fn(&Path) -> bool)
    -> Option<(PathBuf, String)> {
    if !appimage || keep {
        return None;
    }
    let ours = cache.join("hpc-hub").join("fonts.conf");
    let base = current.filter(|c| !c.is_empty()).unwrap_or(SYSTEM);
    if Path::new(base) == ours || !exists(Path::new(base)) {
        return None; // never include itself (a second start from this one)
    }
    Some((ours, config(base)))
}

/// Before any thread starts: writes the config and points FONTCONFIG_FILE at it. Nothing on failure.
#[cfg(target_os = "linux")]
pub fn avoid_colrv1() {
    let env = |k: &str| std::env::var(k).ok();
    let Some(cache) = env("XDG_CACHE_HOME").filter(|c| !c.is_empty()).map(PathBuf::from)
        .or_else(|| env("HOME").map(|h| Path::new(&h).join(".cache"))) else { return };
    let current = env("FONTCONFIG_FILE");
    let Some((file, text)) = plan(env("APPIMAGE").is_some(), env("HPC_HUB_COLOR_EMOJI").is_some(),
                                  current.as_deref(), &cache, |p| p.is_file()) else { return };
    let same = std::fs::read_to_string(&file).map(|t| t == text).unwrap_or(false);
    if !same && (file.parent().map(std::fs::create_dir_all).transpose().is_err() || std::fs::write(&file, text).is_err()) {
        return;
    }
    // SAFETY: called first thing in main, before any other thread exists
    unsafe { std::env::set_var("FONTCONFIG_FILE", &file) };
}

#[cfg(test)]
mod tests {
    use super::*;

    const CACHE: &str = "/home/jdoe/.cache";

    fn yes(_: &Path) -> bool {
        true
    }

    #[test]
    fn an_appimage_gets_a_config_without_colrv1_fonts() {
        let (file, text) = plan(true, false, None, Path::new(CACHE), yes).unwrap();
        assert_eq!(file, Path::new("/home/jdoe/.cache/hpc-hub/fonts.conf"));
        assert!(text.contains("<include ignore_missing=\"no\">/etc/fonts/fonts.conf</include>"));
        assert!(text.contains("<rejectfont><glob>*COLRv1*</glob></rejectfont>"));
    }

    #[test]
    fn the_reject_pattern_matches_fedoras_emoji_files_only() {
        let glob = |name: &str| name.contains(REJECT.trim_matches('*'));
        assert!(glob("/usr/share/fonts/google-noto-color-emoji-fonts/Noto-COLRv1.ttf"));
        assert!(glob("/usr/share/fonts/google-noto-color-emoji-fonts/Noto-COLRv1-noflags.ttf"));
        assert!(!glob("/usr/share/fonts/noto-emoji/NotoColorEmoji.ttf")); // the bitmap build other systems ship
        assert!(!glob("/usr/share/fonts/google-noto-emoji-fonts/NotoEmoji-Regular.ttf"));
    }

    #[test]
    fn your_own_fontconfig_file_is_kept_inside_it() {
        let (_, text) = plan(true, false, Some("/home/jdoe/my fonts & more.conf"), Path::new(CACHE), yes).unwrap();
        assert!(text.contains("<include ignore_missing=\"no\">/home/jdoe/my fonts &amp; more.conf</include>"));
    }

    #[test]
    fn nothing_changes_outside_an_appimage_or_when_you_keep_the_fonts() {
        assert!(plan(false, false, None, Path::new(CACHE), yes).is_none()); // .deb / .rpm: the system's WebKit
        assert!(plan(true, true, None, Path::new(CACHE), yes).is_none()); // HPC_HUB_COLOR_EMOJI=1
    }

    #[test]
    fn never_without_a_base_config_and_never_including_itself() {
        assert!(plan(true, false, None, Path::new(CACHE), |_| false).is_none());
        assert!(plan(true, false, Some("/home/jdoe/.cache/hpc-hub/fonts.conf"), Path::new(CACHE), yes).is_none());
    }

    #[test]
    fn main_sets_it_up_before_anything_else() {
        let main = include_str!("main.rs");
        let body = &main[main.find("fn main()").unwrap()..];
        assert!(body.find("fonts::avoid_colrv1()").unwrap() < body.find("hpc_hub_lib::run()").unwrap());
    }
}
