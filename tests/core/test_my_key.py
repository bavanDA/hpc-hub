"""This computer's SSH key: found, made once and never replaced, and ssh's answer put in words."""

import os
import stat

import pytest

from hpc_hub.core import login_copy as C
from hpc_hub.core import my_key


@pytest.fixture
def home(monkeypatch, tmp_path):
    monkeypatch.setattr(my_key.Path, "home", lambda: tmp_path)
    return tmp_path


def test_create_then_find(home):
    assert my_key.find() is None
    key = my_key.create()
    assert key.kind == "ed25519" and key.public.startswith("ssh-ed25519 ") and key.public.endswith("(HPC Hub)")
    assert (home / ".ssh" / "id_ed25519").read_text().startswith("-----BEGIN OPENSSH PRIVATE KEY-----")
    if os.name != "nt":
        assert stat.S_IMODE((home / ".ssh" / "id_ed25519").stat().st_mode) == 0o600
        assert stat.S_IMODE((home / ".ssh").stat().st_mode) == 0o700
    assert my_key.find() == key
    with pytest.raises(FileExistsError):
        my_key.create()  # never over yours
    assert my_key.find().public == key.public


def test_finds_an_older_key_and_needs_both_halves(home):
    (home / ".ssh").mkdir()
    (home / ".ssh" / "id_rsa").write_text("private")
    assert my_key.find() is None  # no .pub
    (home / ".ssh" / "id_rsa.pub").write_text("ssh-rsa AAAAB3Nza jdoe@laptop\n")
    key = my_key.find()
    assert key.kind == "rsa" and key.public == "ssh-rsa AAAAB3Nza jdoe@laptop"
    assert key.json()["made_on"]


def test_test_argv_uses_only_this_key_and_never_prompts():
    key = my_key.MyKey("/home/jdoe/.ssh/id_ed25519", "ed25519", "ssh-ed25519 AAAA", 0)
    argv = my_key.test_argv(key, "jdoe", "login.example.edu", 2222)
    assert argv[:2] == ["ssh", "-v"] and "BatchMode=yes" in argv and "IdentitiesOnly=yes" in argv
    assert argv[argv.index("-i") + 1] == key.path and argv[-3:] == ["--", "login.example.edu", "true"]


Y = "Yale Bouchet"


@pytest.mark.parametrize("output, code, kind, text", [
    ('debug1: Authenticated using "publickey" with partial success.\nPermission denied (keyboard-interactive).',
     255, "ok", C.TEST_OK.format(name=Y)),
    ("", 0, "ok", C.TEST_OK.format(name=Y)),
    ("debug1: Next authentication method: publickey\njdoe@login: Permission denied (publickey,keyboard-interactive).",
     255, "wait", C.TEST_UNKNOWN_KEY.format(name=Y)),
    ("ssh: connect to host login.example.edu port 22: Connection timed out", 255, "error",
     C.TEST_UNREACHABLE_VPN.format(name=Y, vpn="Yale")),
    ("Host key verification failed.", 255, "error", C.TEST_HOST_KEY.format(name=Y)),
    ("debug1: x\nkex_exchange_identification: read: Connection reset by peer", 255, "error",
     C.TEST_UNFINISHED.format(last="kex_exchange_identification: read: Connection reset by peer")),
])
def test_verdict(output, code, kind, text):
    got = my_key.verdict(output, code, Y, vpn="Yale")
    assert (got.kind, got.text, got.ok) == (kind, text, kind == "ok")
    assert "Connect to the Yale VPN" in my_key.verdict("No route to host", 255, Y, "Yale").text


def test_no_vpn_no_vpn_question():
    assert my_key.verdict("ssh: Could not resolve hostname x", 255, "SDSC Expanse").text == \
        C.TEST_UNREACHABLE.format(name="SDSC Expanse")
