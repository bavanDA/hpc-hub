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


def test_finds_a_key_with_another_name_ed25519_first(home):
    d = home / ".ssh"
    d.mkdir()
    for name, line in (("work_rsa", "ssh-rsa AAAAB3 jdoe@lab"), ("yale_ed", "ssh-ed25519 AAAAC3 jdoe@lab")):
        (d / name).write_text("private")
        (d / f"{name}.pub").write_text(line + "\n")
    (d / "known_hosts").write_text("x")
    key = my_key.find()
    assert key.file == "yale_ed" and key.kind == "ed25519"


def test_load_a_picked_key(home):
    made = my_key.create()
    (home / ".ssh" / "id_ed25519.pub").unlink()  # no .pub: the public half comes from the key itself
    got = my_key.load(made.path)
    assert got.public.split()[:2] == made.public.split()[:2] and got.kind == "ed25519"
    assert my_key.load(made.path + ".pub").path == made.path  # picking the .pub means its private key
    other = home / "elsewhere"
    other.write_text("not a key")
    with pytest.raises(ValueError, match="isn't an SSH private key"):
        my_key.load(other)
    with pytest.raises(ValueError, match="Can't find"):
        my_key.load(home / "nothing")
    (home / ".ssh" / "id_ed25519.pub").write_text(made.public + "\n")
    assert my_key.find(str(home / "nothing")).path == made.path  # a picked key that's gone: back to the usual one


def test_test_argv_uses_only_this_key_and_never_prompts():
    key = my_key.MyKey("/home/jdoe/.ssh/id_ed25519", "ed25519", "ssh-ed25519 AAAA", 0)
    argv = my_key.test_argv(key, "jdoe", "login.example.edu", 2222)
    assert argv[:2] == ["ssh", "-v"] and "BatchMode=yes" in argv and "IdentitiesOnly=yes" in argv
    assert argv[argv.index("-i") + 1] == key.path and argv[-3:] == ["--", "login.example.edu", "true"]


@pytest.mark.parametrize("output, code, reason, kind", [
    ('debug1: Authenticated using "publickey" with partial success.\nPermission denied (keyboard-interactive).',
     255, "ok", "ok"),
    ("", 0, "ok", "ok"),
    ("debug1: Next authentication method: publickey\njdoe@login: Permission denied (publickey,keyboard-interactive).",
     255, "not_yet", "wait"),
    ("ssh: connect to host login.example.edu port 22: Connection timed out", 255, "no_vpn", "error"),
    ("Host key verification failed.", 255, "host_key", "error"),
    ("debug1: x\nkex_exchange_identification: read: Connection reset by peer", 255, "unfinished", "error"),
])
def test_verdict(output, code, reason, kind):
    got = my_key.verdict(output, code, "Yale", vpn=True)
    assert (got.reason, got.kind, got.ok) == (reason, kind, kind == "ok")
    assert got.text and "Bouchet" not in got.text  # the full name is the title's
    assert got.json()["reason"] == reason


def test_sentences():
    assert my_key.Result("ok", "Yale").text == "Signed in."
    assert my_key.Result("not_yet", "Yale").text.startswith("Yale hasn't picked up your key yet.")
    assert my_key.verdict("No route to host", 255, "Yale", True).text.startswith("Yale is only reachable on the VPN")
    last = "kex_exchange_identification: read: Connection reset by peer"
    assert my_key.Result("unfinished", "Yale", last).text == f"That didn't finish: {last}"


def test_no_vpn_no_vpn_question():
    assert my_key.verdict("ssh: Could not resolve hostname x", 255, "SDSC").reason == "unreachable"
    assert C.TEST["unreachable"].format(who="SDSC") == "Can't get through to SDSC from this network."
