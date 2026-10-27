import pytest

from hpc_hub.api.methods import preferences
from hpc_hub.core import browser, config, features


@pytest.fixture
def app_file(tmp_path, monkeypatch):
    monkeypatch.setattr(config, "APP_FILE", tmp_path / "hpc-hub" / "app.toml")
    monkeypatch.setattr(browser, "preferred", "")
    monkeypatch.setattr(features, "experimental", False)
    monkeypatch.setattr(features, "select_to_copy", True)
    monkeypatch.setattr(features, "monitor_bar", True)
    return config.APP_FILE


def test_defaults(app_file):
    assert preferences.get() == {"browser_profile": "", "experimental": False, "select_to_copy": True,
                                 "monitor_bar": True}


def test_set_saves_and_keeps_the_rest(app_file):
    config.save_app(config.AppSettings(globus_client_id="abc123"), app_file)
    on = {"experimental": True, "select_to_copy": True, "monitor_bar": True}
    assert preferences.set_(experimental=True) == {"browser_profile": "", **on}
    assert preferences.set_(browser_profile=" Uni ") == {"browser_profile": "Uni", **on}
    saved = config.load_app(app_file)
    assert (saved.globus_client_id, saved.browser_profile, saved.experimental) == ("abc123", "Uni", True)
    assert features.experimental and browser.preferred == "Uni"


def test_back_to_the_system_browser(app_file):
    preferences.set_(browser_profile="Uni")
    preferences.set_(browser_profile="", experimental=False)
    assert preferences.get() == {"browser_profile": "", "experimental": False, "select_to_copy": True,
                                 "monitor_bar": True}


def test_select_to_copy(app_file):
    assert preferences.set_(select_to_copy=False)["select_to_copy"] is False
    assert not config.load_app(app_file).select_to_copy and not features.select_to_copy


def test_monitor_bar(app_file):
    assert preferences.set_(monitor_bar=False)["monitor_bar"] is False
    assert not config.load_app(app_file).monitor_bar and not features.monitor_bar
    assert preferences.get()["select_to_copy"] is True
