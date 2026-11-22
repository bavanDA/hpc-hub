"""The phone's one-time code, the desktop's QR sealed with it, and saving the logins and key from it on the phone."""

import base64
import json

import pytest

from hpc_hub.api import hub as hub_mod
from hpc_hub.api.hub import Hub
from hpc_hub.api.methods import pairing as methods
from hpc_hub.api.server import METHODS
from hpc_hub.core import config, credentials, pairing, ssh_keys
from hpc_hub.core.credentials import Login
from hpc_hub.core.pairing import Code, Entry


class Session:
    def __init__(self, cfg):
        self.cfg = cfg


@pytest.fixture
def store(monkeypatch, tmp_path):
    h = Hub.__new__(Hub)
    h.clusters = config.default_clusters()
    h.sessions = {c.id: Session(c) for c in h.clusters}
    h.save_clusters = lambda: None
    monkeypatch.setattr(hub_mod, "_hub", h)
    monkeypatch.setattr(ssh_keys.Path, "home", lambda: tmp_path)
    monkeypatch.setattr(methods, "_held", {})
    saved = {}
    monkeypatch.setattr(credentials, "load", lambda c, k: saved.get((c, k)))
    monkeypatch.setattr(credentials, "save", lambda c, k, login: saved.__setitem__((c, k), login))
    return saved


def phone() -> str:
    return methods.start()["code"]


def test_apply_saves_the_logins_and_key(store):
    seed = ssh_keys.new()
    text = pairing.code(Code([Entry("wulver", "jdoe", "s3cret"), Entry("sdsc", "jdoe2", key=True),
                              Entry("elsewhere", "x")], seed), phone())
    assert methods.apply(text) == ["Wulver (NJIT)", "SDSC Expanse"]
    assert store == {("wulver", "ssh"): Login("jdoe", "s3cret"), ("sdsc", "ssh"): Login("jdoe2", "")}
    assert ssh_keys.key_path().with_name("id_ed25519.pub").read_text().strip() == ssh_keys.public_line(seed)


def test_start_keeps_one_code_in_memory_until_a_scan_uses_it(store):
    code = phone()
    assert len(code) == 11 and code[5] == "-" and pairing.normalize(code)
    assert phone() == code  # a cancelled camera tries again with the code already typed on the desktop
    methods._held["at"] -= methods.HELD + 1
    assert phone() != code  # left for half an hour: a new one
    methods.apply(pairing.code(Code([Entry("wulver", "jdoe", "s3cret")]), phone()))
    assert methods._held == {}  # used up


def test_the_rpcs_go_start_make_apply(store):
    """The phone shows a code, the desktop seals its logins with it as typed, the phone opens them."""
    store["wulver", "ssh"] = Login("jdoe", "s3cret")
    code = METHODS["pairing.start"]()["code"]
    made = METHODS["pairing.make"](code=f"  {code.lower().replace('-', ' ')} ", clusters=["wulver"])
    assert made["text"].startswith("hpchub-pair:2:") and "s3cret" not in json.dumps(made)
    store.clear()
    assert METHODS["pairing.apply"](code=made["text"]) == ["Wulver (NJIT)"]
    assert store == {("wulver", "ssh"): Login("jdoe", "s3cret")} and methods._held == {}
    with pytest.raises(pairing.PairingError, match="no code waiting"):  # the same QR again: the code is used up
        METHODS["pairing.apply"](code=made["text"])


def test_a_qr_for_another_phone_code_is_refused_and_the_code_kept(store):
    code = phone()
    other = "00000-00000" if code != "00000-00000" else "11111-11111"
    with pytest.raises(pairing.PairingError) as got:
        methods.apply(pairing.code(Code([Entry("wulver", "jdoe", "s3cret")]), other))
    assert str(got.value) == pairing.WRONG_CODE and store == {}
    assert phone() == code  # type it again on the desktop, scan again
    assert methods.apply(pairing.code(Code([Entry("wulver", "jdoe", "s3cret")]), code)) == ["Wulver (NJIT)"]


def test_apply_refuses_a_version_1_code_and_a_phone_without_a_code(store):
    old = {"exp": 9999999999, "logins": {"wulver": {"user": "jdoe", "password": "s3cret"}}}
    text = "hpchub-pair:1:" + base64.urlsafe_b64encode(json.dumps(old).encode()).decode().rstrip("=")
    with pytest.raises(pairing.PairingError, match="no code waiting"):
        methods.apply(text)
    phone()
    with pytest.raises(pairing.PairingError, match="Update HPC Hub there"):
        methods.apply(text)
    assert store == {}


class KeySsh:
    def __init__(self, fail=""):
        self.ran, self.fail = [], fail

    def run(self, command, timeout=60, fast=None):
        import subprocess
        self.ran.append(command)
        return subprocess.CompletedProcess(command, 1 if self.fail else 0, "", self.fail)
    on_login = run


def test_make_puts_a_key_on_clusters_that_take_keys(store):
    store["wulver", "ssh"] = Login("jdoe", "s3cret")
    store["sdsc", "ssh"] = Login("jdoe2", "")
    sdsc = hub_mod._hub.sessions["sdsc"]
    sdsc.connected, sdsc.ssh = True, KeySsh()
    code = phone()
    got = methods.make(code, ["wulver", "sdsc", "elsewhere"])
    assert got["clusters"] == ["Wulver (NJIT)", "SDSC Expanse"] and got["skipped"] == []
    (line,) = sdsc.ssh.ran
    assert "authorized_keys" in line and ssh_keys.COMMENT in line
    back = pairing.parse(got["text"], code)
    assert back.key and [e.key for e in back.entries] == [False, True] and back.entries[0].password == "s3cret"
    assert len(got["matrix"]) == len(got["matrix"][0]) and set("".join(got["matrix"])) == {"0", "1"}
    assert got["svg"].startswith("<svg") and 'fill="#000"' in got["svg"]
    nopw = pairing.parse(methods.make(code, ["wulver"], passwords=False)["text"], code)
    assert nopw.entries[0].password == "" and not nopw.key


def test_make_needs_the_phone_code_before_it_adds_a_key(store):
    store["sdsc", "ssh"] = Login("jdoe2", "")
    sdsc = hub_mod._hub.sessions["sdsc"]
    sdsc.connected, sdsc.ssh = True, KeySsh()
    for typed in ("", "7K2QM", "7K2QM-X9D4RR"):
        with pytest.raises(pairing.PairingError, match="10 letters and digits"):
            methods.make(typed, ["sdsc"])
    with pytest.raises(pairing.PairingError, match="10 letters and digits"):
        METHODS["pairing.make"](clusters=["sdsc"])  # an older desktop page that sends no code
    assert sdsc.ssh.ran == []


def test_make_skips_a_key_cluster_it_cannot_reach(store):
    store["wulver", "ssh"] = Login("jdoe", "s3cret")
    store["sdsc", "ssh"] = Login("jdoe2", "")
    hub_mod._hub.sessions["sdsc"].connected = False
    code = phone()
    got = methods.make(code, ["wulver", "sdsc"])
    assert got["clusters"] == ["Wulver (NJIT)"] and "Connect it first" in got["skipped"][0]["reason"]
    sdsc = hub_mod._hub.sessions["sdsc"]
    sdsc.connected, sdsc.ssh = True, KeySsh(fail="Disk quota exceeded")
    with pytest.raises(pairing.PairingError, match="Disk quota"):
        methods.make(code, ["sdsc"])
    store.clear()
    with pytest.raises(pairing.PairingError, match="No saved logins"):
        methods.make(code)


def test_apply_needs_a_known_cluster(store):
    with pytest.raises(pairing.PairingError, match="no login"):
        methods.apply(pairing.code(Code([Entry("elsewhere", "x")]), phone()))
    assert not ssh_keys.key_path().exists() and methods._held  # nothing saved, the code still waits


def test_apply_saves_a_vpn_login_of_its_own(store):
    seed = ssh_keys.new()
    methods.apply(pairing.code(Code([Entry("yale", "jd123", key=True, vpn_user="jane.doe@example.edu",
                                           vpn_password="vpnpass")], seed), phone()))
    assert store == {("yale", "ssh"): Login("jd123", ""), ("yale", "vpn"): Login("jane.doe@example.edu", "vpnpass")}
