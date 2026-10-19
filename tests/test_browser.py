import json

from hpc_hub import browser


def test_profiles_and_find(tmp_path):
    (tmp_path / "Local State").write_text(json.dumps({"profile": {"info_cache": {
        "Default": {"name": "Your Chrome", "user_name": "a@gmail.com"},
        "Profile 2": {"name": "Uni", "user_name": "jdoe@njit.edu"}}}}))
    found = browser.profiles(tmp_path)
    assert [(p.folder, p.name) for p in found] == [("Profile 2", "Uni"), ("Default", "Your Chrome")]
    assert browser.find("uni", found).folder == "Profile 2"
    assert browser.find("", found) is None and browser.find("nope", found) is None


def test_missing_chrome_config(tmp_path):
    assert browser.profiles(tmp_path) == []
