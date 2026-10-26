import json
import socket
import threading
from pathlib import Path

import pytest

from hpc_hub.connect import vpn_helper
from hpc_hub.connect.vpn import VpnError
from hpc_hub.core import config


class FakeHelper:
    """Speaks the helper's protocol (docs/design/vpn-helper.md) on a Unix socket; the tunnel comes up after
    `delay` status calls, or fails with `fail`."""

    def __init__(self, path: Path, delay: int = 1, fail: str = ""):
        self.path, self.delay, self.fail = str(path), delay, fail
        self.requests: list[dict] = []
        self.state, self.polls = "down", 0
        self.server = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
        self.server.bind(self.path)
        self.server.listen()
        threading.Thread(target=self._serve, daemon=True).start()

    def _serve(self):
        while True:
            try:
                conn, _ = self.server.accept()
            except OSError:
                return
            with conn:
                req = json.loads(conn.makefile("rb").readline())
                self.requests.append(req)
                conn.sendall((json.dumps(self._answer(req)) + "\n").encode())

    def _answer(self, req: dict) -> dict:
        op = req.get("op")
        if op == "version":
            return {"ok": True, "version": vpn_helper.VERSION}
        if op == "up":
            if "evil" in req["url"]:
                return {"ok": False, "error": "gateway not allowed"}
            self.state, self.polls = "connecting", 0
            return {"ok": True}
        if op == "status":
            self.polls += 1
            if self.state == "connecting" and self.polls >= self.delay:
                self.state = "down" if self.fail else "up"
            return {"ok": True, "state": self.state, "error": self.fail, "log": [self.fail] if self.fail else []}
        if op == "down":
            self.state = "down"
            return {"ok": True}
        return {"ok": False, "error": "unknown op"}

    def close(self):
        self.server.close()


@pytest.fixture
def wulver():
    return config.default_clusters()[0]


def make(cfg, address, confirm=lambda t, x: False):
    logged = []
    v = vpn_helper.HelperVpn(cfg, logged.append, confirm, address=address)
    return v, logged


def test_up_and_down_through_the_helper(tmp_path, wulver, monkeypatch):
    monkeypatch.setattr(vpn_helper, "UP_TIMEOUT", 5)
    helper = FakeHelper(tmp_path / "h.sock", delay=2)
    try:
        v, _ = make(wulver, helper.path)
        v.ensure_profile()  # installed and the right version: nothing asked
        assert not v.is_active()
        v.up({"COOKIE": "webvpn=abc", "HOST": "vpn.njit.edu", "FINGERPRINT": "pin-sha256:xyz",
              "RESOLVE": "vpn.njit.edu:192.0.2.7"})
        assert v.is_active()
        up = next(r for r in helper.requests if r["op"] == "up")
        assert up["url"] == "https://vpn.njit.edu" and up["cookie"] == "webvpn=abc"
        assert up["servercert"] == "pin-sha256:xyz" and up["resolve"] == "vpn.njit.edu:192.0.2.7"
        assert up["routes"] == ["128.235.0.0/16"] and up["domains"] == ["njit.edu"]  # Wulver's split tunnel
        v.down()
        assert not v.is_active()
    finally:
        helper.close()


def test_a_failed_tunnel_says_why(tmp_path, wulver, monkeypatch):
    monkeypatch.setattr(vpn_helper, "UP_TIMEOUT", 5)
    helper = FakeHelper(tmp_path / "h.sock", fail="Failed to open tun device")
    try:
        v, logged = make(wulver, helper.path)
        with pytest.raises(VpnError, match="tun device"):
            v.up({"COOKIE": "c", "HOST": "vpn.njit.edu", "RESOLVE": "x:1"})
        assert "vpn: Failed to open tun device" in logged
    finally:
        helper.close()


def test_no_helper_asks_before_installing(tmp_path, wulver, monkeypatch):
    asked, installed = [], []
    monkeypatch.setattr(vpn_helper, "install", installed.append)
    v, _ = make(wulver, str(tmp_path / "none.sock"), lambda title, text: asked.append(text) or False)
    with pytest.raises(VpnError, match="needs the helper"):
        v.ensure_profile()
    assert asked and "installs a small helper once" in asked[0] and not installed  # said no: nothing installed
    v.confirm = lambda title, text: True
    v.ensure_profile()
    assert installed == [["vpn.njit.edu"]]
    assert not v.is_active()  # still no helper: just "not up"


def test_install_args_always_allow_the_known_gateways():
    args = vpn_helper.install_args(["VPN.example.edu", "vpn.njit.edu"], "4242", Path("/opt/app/vpn"))
    assert args[:5] == ["install", "--user", "4242", "--from", "/opt/app/vpn"]
    assert [args[i + 1] for i, a in enumerate(args) if a == "--gateway"] == \
        ["vpn.njit.edu", "access.yale.edu", "vpn.example.edu"]


def test_full_tunnel_sends_no_routes(wulver):
    wulver.vpn.split_tunnel = False
    req = vpn_helper.up_request(wulver, {"COOKIE": "c", "HOST": "https://vpn.njit.edu/gw", "RESOLVE": "a:1"})
    assert req["url"] == "https://vpn.njit.edu/gw" and req["routes"] == [] and req["domains"] == []


def test_sign_in_uses_the_shipped_openconnect_without_the_linux_browser(tmp_path, wulver, monkeypatch):
    monkeypatch.setenv("HPC_HUB_RESOURCES", str(tmp_path))
    exe = tmp_path / "vpn" / "openconnect" / "openconnect"
    exe.parent.mkdir(parents=True)
    exe.write_text("#!/bin/sh\necho \"$@\" > \"$(dirname \"$0\")/args\"\necho COOKIE=abc\n")
    exe.chmod(0o755)
    (exe.parent / "cert.pem").write_text("certs")
    v, _ = make(wulver, str(tmp_path / "none.sock"))
    assert v.openconnect == str(exe) and v.external_browser == ""
    auth = v.authenticate("jdoe", "pw", ask=lambda p: None, on_duo=lambda: None)
    args = (exe.parent / "args").read_text()
    assert auth["COOKIE"] == "abc" and f"--cafile {exe.parent / 'cert.pem'}" in args
    assert "--external-browser" not in args
