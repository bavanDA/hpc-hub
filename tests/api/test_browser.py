import json

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
    assert [(p["folder"], p["name"], p["email"]) for p in got["profiles"]] == [
        ("Default", "Home", "jdoe@example.com"), ("Profile 2", "Uni", "")]


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
    assert mac[0] == "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
    assert str(tmp_path / "Applications" / "Google Chrome.app/Contents/MacOS/Google Chrome") in mac
    assert browser.chrome_candidates("linux", {}, tmp_path) == browser.CHROME_BINS
    assert browser.chrome_dirs("darwin", {}, tmp_path)[0] == tmp_path / "Library/Application Support/Google/Chrome"
    assert browser.chrome_dirs("win32", env, tmp_path)[0].name == "User Data"


def test_chrome_found_by_its_full_path(tmp_path, monkeypatch):
    exe = tmp_path / "Google Chrome"
    monkeypatch.setattr(browser, "chrome_candidates", lambda: [str(tmp_path / "missing"), str(exe)])
    assert browser.chrome() == ""
    exe.write_text("")
    assert browser.chrome() == str(exe)
