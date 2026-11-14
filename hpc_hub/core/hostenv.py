"""Programs the backend starts, and its own TLS, as on this computer rather than as in the app's bundle.

The Linux AppImage runs the app with its own libraries first: LD_LIBRARY_PATH, GTK_PATH, GIO_MODULE_DIR and more
point into the AppImage (built on an older Ubuntu). The backend itself is past the point where that matters, but
every program it starts would inherit it: the system's openconnect then loads the AppImage's GnuTLS, which fails on
Fedora's crypto policy ("Failed to set GnuTLS priority string"), and the sign-in window loads the wrong GTK.

So at start the backend takes the AppImage back out of its environment (apply), and points its own Python's TLS at
this computer's certificate authorities, which an OpenSSL built on Ubuntu looks for in the wrong place on Fedora."""

import os
import re
import ssl
import sys

# Where Linux distributions keep the trusted certificate authorities (Fedora/RHEL, Debian/Ubuntu/Arch, others)
CA_BUNDLES = ("/etc/pki/ca-trust/extracted/pem/tls-ca-bundle.pem", "/etc/ssl/certs/ca-certificates.crt",
              "/etc/ssl/cert.pem", "/etc/pki/tls/cert.pem")
# An AppImage mount (this one's or the one that started it), or where the frozen backend unpacks its own Python and
# libraries (PyInstaller's _MEI folder: an OpenSSL older than Fedora's, which openconnect must never load)
_BUNDLE = re.compile(r"^/tmp/(\.mount_|_MEI)[^/]+(/|$)")
_KEEP = {"APPDIR", "APPIMAGE", "ARGV0", "OWD", "HPC_HUB_RESOURCES"}  # where the app is: still needed


def host(environ: dict[str, str], unpacked: str = "") -> dict[str, str]:
    """environ without the app's bundles: the AppImage's folders and the frozen backend's unpacked libraries
    (unpacked: that folder, sys._MEIPASS). A path list loses those entries (PATH keeps them, last, so the app's own
    programs are still found); a variable left empty goes. PyInstaller's own variables go too: they would tell a
    program it is one of its parts."""
    appdir = environ.get("APPDIR", "")
    unpacked = unpacked or environ.get("_PYI_APPLICATION_HOME_DIR", "")
    if not appdir and not unpacked:
        return dict(environ)
    roots = [r for r in (appdir, unpacked) if r]

    def bundled(part: str) -> bool:
        return any(part.startswith(r) for r in roots) or bool(_BUNDLE.match(part))

    env = {}
    for key, value in environ.items():
        if key.startswith("_PYI_") or key == "LD_LIBRARY_PATH_ORIG":
            continue
        if key in _KEEP or not any(bundled(p) for p in value.split(":")):
            env[key] = value
            continue
        parts = value.split(":")
        kept = [p for p in parts if p and not bundled(p)]
        if key == "PATH":
            kept += [p for p in parts if p and bundled(p)]
        if kept:
            env[key] = ":".join(kept)
    return env


def ca_file(environ: dict[str, str], exists=os.path.isfile) -> str:
    """A certificate authority file for this Python's TLS when its own default is missing; "" when it has one."""
    if environ.get("SSL_CERT_FILE") or environ.get("SSL_CERT_DIR"):
        return ""
    paths = ssl.get_default_verify_paths()
    if paths.cafile and exists(paths.cafile):
        return ""
    return next((f for f in CA_BUNDLES if exists(f)), "")


def apply() -> None:
    """At the backend's start: when frozen or in the AppImage, the clean environment for everything it starts; on Linux and macOS,
    TLS that verifies (the .rpm and the macOS app carry an OpenSSL built elsewhere too). Windows' Python reads the
    system's own certificate store, so nothing to do there."""
    unpacked = getattr(sys, "_MEIPASS", "")
    if os.environ.get("APPDIR") or unpacked:
        clean = host(dict(os.environ), unpacked)
        for key in [k for k in os.environ if k not in clean]:
            del os.environ[key]
        os.environ.update(clean)
    if sys.platform != "win32" and (cafile := ca_file(dict(os.environ))):
        os.environ["SSL_CERT_FILE"] = cafile
