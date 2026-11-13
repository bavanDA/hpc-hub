"""The AppImage's folders come out of what the backend hands to other programs, and TLS finds the CA file."""

import os

import pytest

from hpc_hub.core import hostenv

APP = "/tmp/.mount_HPC-Hub1a2b3c"
OLD = "/tmp/.mount_HPC-Hubzz9999"  # the AppImage that started this one (an update)


def appimage_env() -> dict:
    return {
        "APPDIR": APP, "APPIMAGE": "/home/jdoe/Applications/HPC-Hub.AppImage", "HOME": "/home/jdoe",
        "LD_LIBRARY_PATH": f"{APP}/usr/lib/:{APP}/usr/lib/x86_64-linux-gnu/:{OLD}/usr/lib/",
        "PATH": f"{APP}/usr/bin/:{OLD}/usr/bin/:/usr/local/bin:/usr/bin",
        "PYTHONHOME": f"{APP}/usr/", "PYTHONPATH": f"{APP}/usr/share/pyshared/:{OLD}/usr/share/pyshared/:",
        "GTK_PATH": f"{APP}//usr/lib/gtk-3.0", "GIO_MODULE_DIR": f"{APP}//usr/lib/gio/modules",
        "GDK_PIXBUF_MODULE_FILE": f"{APP}//usr/lib/gdk-pixbuf-2.0/2.10.0/loaders.cache",
        "XDG_DATA_DIRS": f"{APP}/usr/share/:/usr/share:/home/jdoe/.local/share/flatpak/exports/share",
        "GTK_THEME": "Adwaita:dark", "HPC_HUB_RESOURCES": f"{APP}/usr/lib/HPC Hub",
    }


def test_the_appimage_comes_out():
    env = hostenv.host(appimage_env())
    for gone in ("LD_LIBRARY_PATH", "PYTHONHOME", "PYTHONPATH", "GTK_PATH", "GIO_MODULE_DIR", "GDK_PIXBUF_MODULE_FILE"):
        assert gone not in env, gone
    assert env["XDG_DATA_DIRS"] == "/usr/share:/home/jdoe/.local/share/flatpak/exports/share"
    assert env["PATH"] == f"/usr/local/bin:/usr/bin:{APP}/usr/bin/:{OLD}/usr/bin/", "the system's programs first"
    assert env["GTK_THEME"] == "Adwaita:dark" and env["HOME"] == "/home/jdoe"
    assert env["APPDIR"] == APP and env["HPC_HUB_RESOURCES"] == f"{APP}/usr/lib/HPC Hub"


def test_system_library_paths_stay():
    env = hostenv.host({**appimage_env(), "LD_LIBRARY_PATH": f"{APP}/usr/lib:/opt/cuda/lib64"})
    assert env["LD_LIBRARY_PATH"] == "/opt/cuda/lib64"


def test_outside_an_appimage_nothing_changes():
    env = {"PATH": "/usr/bin", "LD_LIBRARY_PATH": "/opt/x/lib", "PYTHONPATH": "/srv/py"}
    assert hostenv.host(env) == env


def test_ca_file_only_when_the_default_is_missing(monkeypatch):
    class Paths:
        cafile = None
    monkeypatch.setattr(hostenv.ssl, "get_default_verify_paths", lambda: Paths)
    fedora = "/etc/pki/ca-trust/extracted/pem/tls-ca-bundle.pem"
    assert hostenv.ca_file({}, exists=lambda f: f == fedora) == fedora
    assert hostenv.ca_file({}, exists=lambda f: f == "/etc/ssl/cert.pem") == "/etc/ssl/cert.pem"  # macOS
    assert hostenv.ca_file({"SSL_CERT_FILE": "/mine.pem"}, exists=lambda f: True) == "", "the user's own wins"
    assert hostenv.ca_file({}, exists=lambda f: False) == ""
    Paths.cafile = "/usr/lib/ssl/cert.pem"
    assert hostenv.ca_file({}, exists=lambda f: True) == "", "its own default is there"


def test_apply_changes_this_process(monkeypatch):
    for k in list(os.environ):
        monkeypatch.delenv(k)
    for k, v in appimage_env().items():
        monkeypatch.setenv(k, v)
    monkeypatch.setattr(hostenv, "ca_file", lambda env: "/etc/pki/tls/cert.pem")
    monkeypatch.setattr(hostenv.sys, "platform", "linux")
    hostenv.apply()
    assert "LD_LIBRARY_PATH" not in os.environ and os.environ["PATH"].startswith("/usr/local/bin:")
    assert os.environ["SSL_CERT_FILE"] == "/etc/pki/tls/cert.pem"


@pytest.mark.skipif(not os.path.isfile("/usr/bin/openconnect"), reason="needs openconnect")
def test_openconnect_starts_with_the_clean_environment(tmp_path):
    """The real failure: openconnect with a foreign GnuTLS on its library path. A stand-in folder of junk libraries
    makes the same point: once the AppImage is out of the path, the system's openconnect runs."""
    import subprocess
    lib = tmp_path / ".mount_HPC-Hubtest" / "usr" / "lib"
    lib.mkdir(parents=True)
    (lib / "libgnutls.so.30").write_bytes(b"not a library")
    env = {"APPDIR": str(tmp_path / ".mount_HPC-Hubtest"), "PATH": "/usr/bin", "LD_LIBRARY_PATH": str(lib)}
    broken = subprocess.run(["/usr/bin/openconnect", "--version"], env=env, capture_output=True, text=True)
    fixed = subprocess.run(["/usr/bin/openconnect", "--version"], env=hostenv.host(env), capture_output=True, text=True)
    assert broken.returncode != 0 and fixed.returncode == 0, (broken.stderr[-200:], fixed.stderr[-200:])
