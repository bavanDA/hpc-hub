//! The window fits the screen it opens on. It opens at 1200 x 800, and a small screen (a laptop at 125 %, a VM at
//! 1280 x 800) has less room than that above its taskbar: the bottom of the window, with your cluster and Settings,
//! was hidden behind the taskbar (2026-11-22 report from Windows 11) and couldn't be reached without maximizing.

use tauri::{Manager, PhysicalPosition, PhysicalSize};

/// Where the window goes and how big it is, when it doesn't fit the free area (the screen less its taskbar or Dock);
/// None when it fits. Sizes and positions are physical pixels. It keeps a small gap around it, never shrinks below
/// the window's smallest size (the area wins over that when even the smallest is too big), and is centered.
pub fn fitted(window: (u32, u32), area_at: (i32, i32), area: (u32, u32), smallest: (u32, u32), gap: u32)
    -> Option<((u32, u32), (i32, i32))> {
    let (w, h) = window;
    let (aw, ah) = area;
    if aw == 0 || ah == 0 || (w <= aw && h <= ah) {
        return None;
    }
    let side = |size: u32, room: u32, least: u32| {
        if size <= room {
            size
        } else {
            room.saturating_sub(2 * gap).max(least).min(room)
        }
    };
    let (nw, nh) = (side(w, aw, smallest.0), side(h, ah, smallest.1));
    let x = area_at.0 + ((aw - nw) / 2) as i32;
    let y = area_at.1 + ((ah - nh) / 2) as i32;
    Some(((nw, nh), (x, y)))
}

/// Shrinks the main window to the free area of the screen it is on, when it is bigger. Nothing on failure: the
/// window then opens as before.
pub fn fit_main(app: &tauri::AppHandle) {
    let Some(win) = app.get_webview_window("main") else { return };
    let (Ok(Some(screen)), Ok(size)) = (win.current_monitor(), win.outer_size()) else { return };
    let area = screen.work_area();
    let scale = screen.scale_factor();
    // tauri.conf.json's minWidth / minHeight (logical), and a 16-point gap
    let least = ((360.0 * scale) as u32, (400.0 * scale) as u32);
    let gap = (16.0 * scale) as u32;
    if let Some(((w, h), (x, y))) = fitted((size.width, size.height), (area.position.x, area.position.y),
                                           (area.size.width, area.size.height), least, gap) {
        let _ = win.set_size(PhysicalSize::new(w, h));
        let _ = win.set_position(PhysicalPosition::new(x, y));
    }
}

#[cfg(test)]
mod tests {
    use super::fitted;

    const LEAST: (u32, u32) = (360, 400);

    #[test]
    fn a_window_that_fits_is_left_alone() {
        assert_eq!(fitted((1200, 800), (0, 0), (1920, 1032), LEAST, 16), None);
        assert_eq!(fitted((1200, 800), (0, 0), (1200, 800), LEAST, 16), None); // exactly the room there is
    }

    #[test]
    fn too_tall_for_the_room_above_the_taskbar_is_shortened_and_centered() {
        // the report: a 1280 x 800 screen with a 48-pixel taskbar leaves 752 rows; the window wanted 800
        let ((w, h), (x, y)) = fitted((1200, 800), (0, 0), (1280, 752), LEAST, 16).unwrap();
        assert_eq!((w, h), (1200, 720));
        assert_eq!((x, y), (40, 16));
        assert!(y as u32 + h <= 752, "the bottom is above the taskbar");
    }

    #[test]
    fn too_wide_and_too_tall_both_shrink() {
        let ((w, h), _) = fitted((1500, 1000), (0, 0), (1366, 728), LEAST, 16).unwrap();
        assert_eq!((w, h), (1334, 696));
    }

    #[test]
    fn a_screen_to_the_right_or_a_taskbar_on_top_keeps_the_window_on_that_screen() {
        let ((_, h), (x, y)) = fitted((1200, 800), (1920, 40), (1280, 760), LEAST, 16).unwrap();
        assert!(x >= 1920 && y >= 40 && y as u32 + h <= 800);
    }

    #[test]
    fn never_smaller_than_the_smallest_window_unless_the_screen_is() {
        let ((w, h), _) = fitted((1200, 800), (0, 0), (380, 410), LEAST, 16).unwrap();
        assert_eq!((w, h), (360, 400)); // the gap gives way to the smallest size
        let ((w, h), (x, y)) = fitted((1200, 800), (0, 0), (300, 350), LEAST, 16).unwrap();
        assert_eq!(((w, h), (x, y)), ((300, 350), (0, 0))); // a tiny screen: all of it, never past it
    }

    #[test]
    fn the_app_fits_its_window_when_it_starts() {
        let lib = include_str!("lib.rs");
        let setup = &lib[lib.find(".setup(").unwrap()..];
        assert!(setup[..setup.find("Ok(())").unwrap()].contains("screen_fit::fit_main(app.handle())"));
    }

    #[test]
    fn a_screen_with_no_size_is_ignored() {
        assert_eq!(fitted((1200, 800), (0, 0), (0, 0), LEAST, 16), None);
    }
}
