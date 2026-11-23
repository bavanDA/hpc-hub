import json
import socket
import threading
from pathlib import Path

import pytest

from hpc_hub.connect import vpn_helper
from hpc_hub.connect.vpn import VpnError
from hpc_hub.core import config


class FakeHelper:
    """Speaks the helper's protocol (docs/design/vpn-helper.md) on a Unix socket; each named tunnel comes up after
    `delay` status calls, or fails with `fail`."""

    def __init__(self, path: Path, delay: int = 1, fail: str = ""):
        self.path, self.delay, self.fail = str(path), delay, fail
        self.requests: list[dict] = []
        self.states: dict[str, str] = {}
        self.polls: dict[str, int] = {}
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
        name = req.get("name")
        if op in ("up", "status", "down") and not name:
            return {"ok": False, "error": "Bad request"}
        if op == "up":
            if "evil" in req["url"]:
                return {"ok": False, "error": "gateway not allowed"}
            self.states[name], self.polls[name] = "connecting", 0
            return {"ok": True}
        if op == "status":
            self.polls[name] = self.polls.get(name, 0) + 1
            if self.states.get(name) == "connecting" and self.polls[name] >= self.delay:
                self.states[name] = "down" if self.fail else "up"
            return {"ok": True, "state": self.states.get(name, "down"), "error": self.fail,
                    "log": [self.fail] if self.fail else []}
        if op == "down":
            self.states[name] = "down"
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
        assert up["name"] == "wulver"
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
    assert asked and "asks for your permission once" in asked[0] and not installed  # said no: nothing installed
    v.confirm = lambda title, text: True
    v.ensure_profile()
    assert installed == [["vpn.njit.edu"]]
    assert not v.is_active()  # still no helper: just "not up"


def test_a_standard_windows_account_is_told_what_works_without_an_admin(tmp_path, wulver, monkeypatch):
    """Its permission prompt wants an administrator's password: say so first, and the ways that need none."""
    asked = []
    monkeypatch.setattr(vpn_helper, "standard_user", lambda: True)
    monkeypatch.setattr(vpn_helper, "install", lambda g: (_ for _ in ()).throw(VpnError("not given")))
    v, _ = make(wulver, str(tmp_path / "none.sock"), lambda title, text: asked.append(text) or False)
    with pytest.raises(VpnError, match="university's own VPN app"):
        v.ensure_profile()
    assert "isn't an administrator" in asked[0] and "campus network" in asked[0]
    v.confirm = lambda title, text: True
    with pytest.raises(VpnError, match="not given. If you don't have one"):
        v.ensure_profile()


def test_not_windows_is_never_a_standard_account(monkeypatch):
    monkeypatch.setattr(vpn_helper, "WINDOWS", False)
    assert vpn_helper.standard_user() is False


def test_install_args_always_allow_the_known_gateways():
    args = vpn_helper.install_args(["VPN.example.edu", "vpn.njit.edu"], "4242", Path("/opt/app/vpn"))
    assert args[:5] == ["install", "--user", "4242", "--from", "/opt/app/vpn"]
    assert [args[i + 1] for i, a in enumerate(args) if a == "--gateway"] == \
        ["vpn.njit.edu", "access.yale.edu", "vpn3.its.yale.edu", "vpn4.its.yale.edu", "vpn5.its.yale.edu",
         "vpn6.its.yale.edu", "vpn.example.edu"]


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


def test_two_clusters_have_two_tunnels(tmp_path, monkeypatch):
    monkeypatch.setattr(vpn_helper, "UP_TIMEOUT", 5)
    wulver, yale = config.default_clusters()[0], next(c for c in config.default_clusters() if c.id == "yale")
    helper = FakeHelper(tmp_path / "h.sock")
    try:
        w, _ = make(wulver, helper.path)
        y, _ = make(yale, helper.path)
        auth = {"COOKIE": "c", "HOST": "vpn.njit.edu", "RESOLVE": "x:1"}
        w.up(auth)
        y.up({**auth, "HOST": "access.yale.edu"})
        assert w.is_active() and y.is_active()
        w.down()
        assert not w.is_active() and y.is_active(), "one going down leaves the other"
        assert {r["name"] for r in helper.requests if r["op"] != "version"} == {"wulver", "yale"}
    finally:
        helper.close()


@pytest.mark.parametrize("cluster_id,name", [("wulver", "wulver"), ("My Cluster_2", "my-cluster-2"),
                                             ("--x--", "x"), ("", "vpn"), ("é", "vpn"), ("a" * 40, "a" * 32)])
def test_tunnel_names(cluster_id, name):
    assert vpn_helper.tunnel_name(cluster_id) == name


def test_side_by_side_needs_split_routes_and_dns_where_the_helper_runs(wulver, monkeypatch):
    monkeypatch.setattr(vpn_helper, "needs_helper", lambda: True)
    assert vpn_helper.side_by_side(wulver)
    wulver.vpn.domains = ""
    assert not vpn_helper.side_by_side(wulver)
    monkeypatch.setattr(vpn_helper, "needs_helper", lambda: False)
    assert vpn_helper.side_by_side(wulver), "Linux: NetworkManager keeps each tunnel's DNS to itself"
    wulver.vpn.routes = ""
    assert not vpn_helper.side_by_side(wulver)
    wulver.vpn.routes, wulver.vpn.split_tunnel = "128.235.0.0/16", False
    assert not vpn_helper.side_by_side(wulver)


# -- Yale's gateway hands the tunnel to another server (2026-11-23: "VPN helper: vpn4.its.yale.edu is not a gateway
# this helper was set up for") ----------------------------------------------------------------------------------

class PickyHelper(FakeHelper):
    """Refuses gateways it wasn't set up for, in validate.rs's words."""

    def __init__(self, path, trusted):
        super().__init__(path)
        self.trusted = set(trusted)

    def _answer(self, req):
        if req.get("op") == "up":
            host = req["url"].split("//", 1)[1].split("/")[0]
            if host not in self.trusted:
                return {"ok": False, "error": f"{host} is not a gateway this helper was set up for"}
        return super()._answer(req)


@pytest.fixture
def yale():
    return next(c for c in config.default_clusters() if c.id == "yale")


YALE_AUTH = {"COOKIE": "webvpn=abc", "HOST": "vpn4.its.yale.edu", "FINGERPRINT": "pin-sha256:xyz",
             "RESOLVE": "vpn4.its.yale.edu:130.132.2.14"}


def test_the_helper_trusts_the_servers_yales_gateway_hands_you_to():
    known = vpn_helper.KNOWN_GATEWAYS
    assert "access.yale.edu" in known
    assert {f"vpn{n}.its.yale.edu" for n in (3, 4, 5, 6)} <= set(known)
    args = vpn_helper.install_args(["access.yale.edu"], "501", Path("/x"))
    assert "vpn4.its.yale.edu" in args and args.count("--gateway") == len(set(known))


def test_the_helpers_refusal_names_the_server():
    """The words of app/vpn-helper/src/validate.rs check_url, which this reads."""
    rust = (Path(__file__).resolve().parents[2] / "app" / "vpn-helper" / "src" / "validate.rs").read_text()
    assert '"{host} is not a gateway this helper was set up for"' in rust
    said = "VPN helper: vpn4.its.yale.edu is not a gateway this helper was set up for"
    assert vpn_helper.untrusted_server(said) == "vpn4.its.yale.edu"
    assert vpn_helper.untrusted_server("VPN helper: Failed to open tun device") == ""


def test_a_helper_set_up_before_it_knew_yales_servers_is_set_up_again_once(tmp_path, yale, monkeypatch):
    monkeypatch.setattr(vpn_helper, "UP_TIMEOUT", 5)
    helper = PickyHelper(tmp_path / "h.sock", {"vpn.njit.edu", "access.yale.edu"})  # an older install
    installed, asked = [], []

    def install(gateways):
        installed.append(gateways)
        helper.trusted |= {*vpn_helper.KNOWN_GATEWAYS, *gateways}
    monkeypatch.setattr(vpn_helper, "install", install)
    try:
        v, logged = make(yale, helper.path, lambda title, text: asked.append(text) or True)
        v.up(YALE_AUTH)
        assert v.is_active()
        assert installed == [["access.yale.edu", "vpn4.its.yale.edu"]]
        assert "vpn4.its.yale.edu" in asked[0] and "permission once more" in asked[0]
        assert [r["op"] for r in helper.requests].count("up") == 2  # refused, then through
        v.up(YALE_AUTH)  # trusted now: nothing asked again
        assert len(installed) == 1 and len(asked) == 1
    finally:
        helper.close()


def test_saying_no_or_an_unknown_server_installs_nothing(tmp_path, yale, monkeypatch):
    helper = PickyHelper(tmp_path / "h.sock", {"access.yale.edu"})
    installed = []
    monkeypatch.setattr(vpn_helper, "install", installed.append)
    try:
        v, _ = make(yale, helper.path, lambda title, text: False)
        with pytest.raises(VpnError, match="until it is set up again"):
            v.up(YALE_AUTH)
        v.confirm = lambda title, text: True
        with pytest.raises(VpnError, match="evil.example.com is not a gateway"):  # never one HPC Hub doesn't know
            v.up({**YALE_AUTH, "HOST": "evil.example.com", "RESOLVE": "evil.example.com:192.0.2.9"})
        assert installed == []
    finally:
        helper.close()
