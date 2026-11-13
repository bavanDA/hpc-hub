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
_MOUNT = re.compile(r"^/tmp/\.mount_[^/]+(/|$)")  # an AppImage mount, this one's or the one that started it
_KEEP = {"APPDIR", "APPIMAGE", "ARGV0", "OWD", "HPC_HUB_RESOURCES"}  # where the app is: still needed


def host(environ: dict[str, str]) -> dict[str, str]:
    """environ without the AppImage's folders. A path list loses its AppImage entries (PATH keeps them, last, so the
    app's own programs are still found); a variable left empty goes."""
    appdir = environ.get("APPDIR", "")
    if not appdir:
        return dict(environ)

    def bundled(part: str) -> bool:
        return part.startswith(appdir) or bool(_MOUNT.match(part))

    env = {}
    for key, value in environ.items():
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
    """At the backend's start: in the AppImage, the clean environment for everything it starts; on Linux and macOS,
    TLS that verifies (the .rpm and the macOS app carry an OpenSSL built elsewhere too). Windows' Python reads the
    system's own certificate store, so nothing to do there."""
    if os.environ.get("APPDIR"):
        clean = host(dict(os.environ))
        for key in [k for k in os.environ if k not in clean]:
            del os.environ[key]
        os.environ.update(clean)
    if sys.platform != "win32" and (cafile := ca_file(dict(os.environ))):
        os.environ["SSL_CERT_FILE"] = cafile
