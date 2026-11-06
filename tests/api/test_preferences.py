import pytest

from hpc_hub.api.methods import preferences
from hpc_hub.core import config


@pytest.fixture
def app_file(tmp_path, monkeypatch):
    monkeypatch.setattr(config, "APP_FILE", tmp_path / "hpc-hub" / "app.toml")
    return config.APP_FILE


OFF = {"experimental_papers": False, "experimental_skills": False, "experimental_schedules": False}


def test_defaults(app_file):
    assert preferences.get() == {"browser_profile": "", **OFF, "select_to_copy": True,
                                 "monitor_bar": True, "appearance": "system"}


def test_set_saves_and_keeps_the_rest(app_file):
    config.save_app(config.AppSettings(globus_client_id="abc123"), app_file)
    on = {**OFF, "experimental_papers": True, "select_to_copy": True, "monitor_bar": True, "appearance": "system"}
    assert preferences.set_(experimental_papers=True) == {"browser_profile": "", **on}
    assert preferences.set_(browser_profile=" Uni ") == {"browser_profile": "Uni", **on}
    saved = config.load_app(app_file)
    assert (saved.globus_client_id, saved.browser_profile, saved.experimental_papers) == ("abc123", "Uni", True)


def test_each_experiment_on_its_own(app_file):
    got = preferences.set_(experimental_skills=True)
    assert [got[k] for k in OFF] == [False, True, False]
    got = preferences.set_(experimental_schedules=True, experimental_skills=False)
    assert (got["experimental_skills"], got["experimental_schedules"]) == (False, True)


def test_the_old_single_switch_turns_all_three_on(app_file):
    app_file.parent.mkdir(parents=True)
    app_file.write_text("[app]\nexperimental = true\nappearance = \"dark\"\n")
    assert preferences.get() == {"browser_profile": "", **{k: True for k in OFF}, "select_to_copy": True,
                                 "monitor_bar": True, "appearance": "dark"}
    preferences.set_(experimental_skills=False)  # saved in the new keys; the old one is gone
    text = app_file.read_text()
    assert "experimental = " not in text and "experimental_skills = false" in text
    assert "experimental_papers = true" in text
    app_file.write_text("[app]\nexperimental = false\n")
    assert preferences.get()["experimental_papers"] is False


def test_back_to_the_system_browser(app_file):
    preferences.set_(browser_profile="Uni")
    preferences.set_(browser_profile="", experimental_papers=False)
    assert preferences.get() == {"browser_profile": "", **OFF, "select_to_copy": True,
                                 "monitor_bar": True, "appearance": "system"}


def test_select_to_copy(app_file):
    assert preferences.set_(select_to_copy=False)["select_to_copy"] is False
    assert not config.load_app(app_file).select_to_copy


def test_monitor_bar(app_file):
    assert preferences.set_(monitor_bar=False)["monitor_bar"] is False
    assert not config.load_app(app_file).monitor_bar
    assert preferences.get()["select_to_copy"] is True


def test_appearance(app_file):
    assert preferences.set_(appearance="dark")["appearance"] == "dark"
    assert config.load_app(app_file).appearance == "dark"
    assert preferences.set_(appearance="frost")["appearance"] == "frost"
    assert preferences.set_(appearance="dark")["appearance"] == "dark"
    with pytest.raises(ValueError, match="Appearance"):
        preferences.set_(appearance="purple")
    assert preferences.get()["appearance"] == "dark"
