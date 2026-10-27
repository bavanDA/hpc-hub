fn main() {
    // 16 KB pages (Android 15+ phones, required by Google Play): the NDK we build with still defaults to 4 KB
    if std::env::var("CARGO_CFG_TARGET_OS").as_deref() == Ok("android") {
        println!("cargo:rustc-link-arg=-Wl,-z,max-page-size=16384");
    }
    tauri_build::build()
}
