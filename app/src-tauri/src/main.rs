// Prevents an extra console window on Windows in release builds.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    // WebKitGTK's DMA-BUF renderer leaves parts of the window unpainted and flickers on some GPUs (NVIDIA, hybrid
    // laptops, Wayland): a page's old header stays over the next page, a busy terminal shimmers. The shared-memory
    // path draws correctly everywhere. Set before any thread or WebKit starts; your own value wins.
    #[cfg(target_os = "linux")]
    if std::env::var_os("WEBKIT_DISABLE_DMABUF_RENDERER").is_none() {
        // SAFETY: first thing in main, before any other thread exists
        unsafe { std::env::set_var("WEBKIT_DISABLE_DMABUF_RENDERER", "1") };
    }
    // the AppImage's WebKit aborts on some COLRv1 color emoji: leave those font files out (fonts.rs)
    #[cfg(target_os = "linux")]
    hpc_hub_lib::fonts::avoid_colrv1();
    hpc_hub_lib::run();
}
