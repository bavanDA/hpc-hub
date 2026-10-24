import pytest

from hpc_hub.api.methods import preferences
from hpc_hub.core import browser, config, features


@pytest.fixture
def app_file(tmp_path, monkeypatch):
    monkeypatch.setattr(config, "APP_FILE", tmp_path / "hpc-hub" / "app.toml")
    monkeypatch.setattr(browser, "preferred", "")
    monkeypatch.setattr(features, "experimental", False)
    return config.APP_FILE


def test_defaults(app_file):
    assert preferences.get() == {"browser_profile": "", "experimental": False}


def test_set_saves_and_keeps_the_rest(app_file):
    config.save_app(config.AppSettings(globus_client_id="abc123"), app_file)
    assert preferences.set_(experimental=True) == {"browser_profile": "", "experimental": True}
    assert preferences.set_(browser_profile=" Uni ") == {"browser_profile": "Uni", "experimental": True}
    saved = config.load_app(app_file)
    assert (saved.globus_client_id, saved.browser_profile, saved.experimental) == ("abc123", "Uni", True)
    assert features.experimental and browser.preferred == "Uni"


def test_back_to_the_system_browser(app_file):
    preferences.set_(browser_profile="Uni")
    preferences.set_(browser_profile="", experimental=False)
    assert preferences.get() == {"browser_profile": "", "experimental": False}
