import json
from pathlib import Path

import pytest

from hpc_hub.api.methods import browser as api
from hpc_hub.core import browser, config


@pytest.fixture
def chrome(tmp_path, monkeypatch):
    """A Chrome with two profiles in a temp folder; launches are recorded, never run."""
    d = tmp_path / "google-chrome"
    d.mkdir()
    (d / "Local State").write_text(json.dumps({"profile": {"info_cache": {
        "Default": {"name": "Home", "user_name": "jdoe@example.com"}, "Profile 2": {"name": "Uni"}}}}))
    monkeypatch.setattr(browser, "CHROME_DIRS", [d])
    monkeypatch.setattr(browser, "chrome_candidates", lambda: browser.CHROME_BINS)  # as on Linux, on any system
    monkeypatch.setattr(browser.shutil, "which", lambda b: "/usr/bin/google-chrome" if b == "google-chrome" else None)
    monkeypatch.setattr(config, "APP_FILE", tmp_path / "app.toml")
    launched = []
    monkeypatch.setattr(browser.subprocess, "Popen", lambda argv, **kw: launched.append(argv))
    return launched


def test_profiles_and_the_default(chrome):
    config.save_app(config.AppSettings(browser_profile="Uni"), config.APP_FILE)
    got = api.profiles()
    assert got["default"] == "Uni"
    assert got["profiles"] == [{"folder": "Default", "name": "Home"}, {"folder": "Profile 2", "name": "Uni"}]


def test_the_account_signed_in_to_chrome_is_never_read(chrome):
    """Only the profiles' folders and names leave Chrome's Local State: not the Google account's email."""
    got = json.dumps(api.profiles())
    assert "jdoe@example.com" not in got and "user_name" not in got and "email" not in got
    src = (Path(__file__).parents[2] / "hpc_hub" / "core" / "browser.py").read_text()
    assert "user_name" not in src.split("def profiles(")[1].split("\ndef ")[0].replace("never the account", "")


def test_nothing_reads_chromes_cookie_files():
    """HPC Hub's sign-in windows keep cookies of their own, in its own folder (paths.web_dir: sso.py's
    cookies.sqlite is the in-app window's); nothing points at a browser's cookie or login files."""
    root = Path(__file__).parents[2] / "hpc_hub"
    for f in root.rglob("*.py"):
        text = f.read_text(encoding="utf-8")
        for name in ('"Cookies"', "'Cookies'", "/Cookies", "Login Data", "Web Data", ".mozilla", "Firefox/Profiles",
                     "Network/Cookies", "Cookies.binarycookies"):
            assert name not in text, f"{f.relative_to(root)} names {name}"
    sso = (root / "connect" / "sso.py").read_text()
    assert 'd = web_dir()' in sso and 'str(d / "cookies.sqlite")' in sso  # its own, in HPC Hub's folder


def test_no_chrome_no_profiles(chrome, monkeypatch):
    monkeypatch.setattr(browser.shutil, "which", lambda b: None)
    assert api.profiles() == {"profiles": [], "default": ""}


def test_open_in_a_profile(chrome):
    assert api.open_link("https://example.com/a", "uni") is True
    assert chrome == [["google-chrome", "--profile-directory=Profile 2", "--", "https://example.com/a"]]


@pytest.mark.parametrize("url,profile", [("https://example.com", ""), ("https://example.com", "Work"),
                                         ("file:///etc/passwd", "Uni"), ("--headless", "Uni")])
def test_otherwise_the_system_browser(chrome, url, profile):
    assert api.open_link(url, profile) is False
    assert chrome == []


def test_chrome_on_each_system(tmp_path):
    env = {"ProgramFiles": r"C:\Program Files", "ProgramFiles(x86)": r"C:\Program Files (x86)",
           "LOCALAPPDATA": r"C:\Users\jdoe\AppData\Local"}
    win = browser.chrome_candidates("win32", env, tmp_path)
    assert win[0].replace("/", "\\").endswith(r"Program Files\Google\Chrome\Application\chrome.exe")
    assert len(win) == 3 and "AppData" in win[2]
    mac = browser.chrome_candidates("darwin", {}, tmp_path)
    assert Path(mac[0]) == Path("/Applications/Google Chrome.app/Contents/MacOS/Google Chrome")
    assert tmp_path / "Applications" / "Google Chrome.app/Contents/MacOS/Google Chrome" in map(Path, mac)
    assert browser.chrome_candidates("linux", {}, tmp_path) == browser.CHROME_BINS
    assert browser.chrome_dirs("darwin", {}, tmp_path)[0] == tmp_path / "Library/Application Support/Google/Chrome"
    assert browser.chrome_dirs("win32", env, tmp_path)[0].name == "User Data"


def test_chrome_found_by_its_full_path(tmp_path, monkeypatch):
    exe = tmp_path / "Google Chrome"
    monkeypatch.setattr(browser, "chrome_candidates", lambda: [str(tmp_path / "missing"), str(exe)])
    assert browser.chrome() == ""
    exe.write_text("")
    assert browser.chrome() == str(exe)
