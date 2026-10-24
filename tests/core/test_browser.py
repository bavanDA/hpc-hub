import json

from hpc_hub.core import browser


def test_profiles_and_find(tmp_path):
    (tmp_path / "Local State").write_text(json.dumps({"profile": {"info_cache": {
        "Default": {"name": "Your Chrome", "user_name": "a@gmail.com"},
        "Profile 2": {"name": "Uni", "user_name": "jdoe@uni.edu"}}}}))
    found = browser.profiles(tmp_path)
    assert [(p.folder, p.name) for p in found] == [("Profile 2", "Uni"), ("Default", "Your Chrome")]
    assert browser.find("uni", found).folder == "Profile 2"
    assert browser.find("", found) is None and browser.find("nope", found) is None


def test_missing_chrome_config(tmp_path):
    assert browser.profiles(tmp_path) == []


def test_open_url_passes_only_web_links(monkeypatch):
    calls = []
    monkeypatch.setattr(browser, "chrome", lambda: "/usr/bin/chrome")
    monkeypatch.setattr(browser, "find", lambda name: browser.Profile("Profile 2", "Uni", ""))
    monkeypatch.setattr(browser.subprocess, "Popen", lambda argv, **kw: calls.append(argv))
    assert browser.open_url("https://example.org/a", "Uni")
    assert calls[-1][-2:] == ["--", "https://example.org/a"]
    assert not browser.open_url("--gpu-launcher=evil", "Uni") and len(calls) == 1
