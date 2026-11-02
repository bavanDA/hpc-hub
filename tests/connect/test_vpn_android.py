"""The phone's VPN (connect/vpn_android.py) with a stand-in openconnect: a script that reads the cookie on stdin and
serves the -L port it is given, as openconnect and ocproxy do together. No network, no real VPN."""

import os
import socket
import sys
import textwrap
import threading

import pytest

from hpc_hub.connect import vpn_android
from hpc_hub.connect.vpn import VpnError
from hpc_hub.core import tunnels
from hpc_hub.core.config import ClusterConfig

COOKIE = "abc123-not-a-real-cookie"
FAKE = """\
#!{python}
# stand-in for openconnect + ocproxy: --authenticate asks for a password and prints a cookie; otherwise the
# cookie comes on stdin and the -L port of --script answers like an SSH server (or forwards to FAKE_VPN_TARGET)
import os, shlex, signal, socket, sys, threading
argv = sys.argv[1:]
log = open(os.environ["FAKE_VPN_LOG"], "a")
if "--authenticate" in argv:
    sys.stderr.write("POST https://vpn.example/\\nPassword:")
    sys.stderr.flush()
    if sys.stdin.readline().strip() != "pw":
        sys.stderr.write("\\nLogin failed.\\n")
        sys.exit(1)
    print("COOKIE='{cookie}'\\nHOST='vpn.example'\\nFINGERPRINT='pin-sha256:abc='")
    sys.exit(0)
if sys.stdin.readline().strip() != "{cookie}":
    sys.stderr.write("Cookie was rejected by server; exiting.\\n")
    sys.exit(2)
script = shlex.split(argv[argv.index("--script") + 1])
port, host, rport = script[script.index("-L") + 1].split(":")
log.write(" ".join(a for a in argv if a != argv[argv.index("--script") + 1]) + "\\n")
log.write(f"script {{os.path.basename(script[0])}} forwards {{port}} to {{host}}:{{rport}}\\n")
log.flush()
if os.environ.get("FAKE_VPN_FAIL"):
    sys.stderr.write(os.environ["FAKE_VPN_FAIL"] + "\\n")
    sys.exit(1)
signal.signal(signal.SIGTERM, lambda *a: (log.write("SIGTERM\\n"), log.flush(), os._exit(0)))
server = socket.create_server(("127.0.0.1", int(port)))
sys.stderr.write("Connected as 10.0.0.2, using SSL\\n")
sys.stderr.flush()
def pipe(a, b):
    try:
        while data := a.recv(65536):
            b.sendall(data)
    except OSError:
        pass
    for s in (a, b):
        try:
            s.shutdown(socket.SHUT_RDWR)
        except OSError:
            pass
while True:
    client, _ = server.accept()
    target = os.environ.get("FAKE_VPN_TARGET")
    if not target:
        client.sendall(b"SSH-2.0-fake\\r\\n")
        client.close()
        continue
    upstream = socket.create_connection((target.split(":")[0], int(target.split(":")[1])))
    for a, b in ((client, upstream), (upstream, client)):
        threading.Thread(target=pipe, args=(a, b), daemon=True).start()
"""


@pytest.fixture
def fake_vpn(tmp_path, monkeypatch):
    """The two programs in a folder of their own, as in the APK's native libraries."""
    bin_dir = tmp_path / "lib"
    bin_dir.mkdir()
    oc = bin_dir / vpn_android.OPENCONNECT
    oc.write_text(textwrap.dedent(FAKE.format(python=sys.executable, cookie=COOKIE)))
    oc.chmod(0o755)
    (bin_dir / vpn_android.OCPROXY).write_text("#!/bin/sh\nexit 1\n")
    (bin_dir / vpn_android.OCPROXY).chmod(0o755)
    monkeypatch.setenv("HPC_HUB_VPN_DIR", str(bin_dir))
    monkeypatch.setenv("XDG_RUNTIME_DIR", str(tmp_path / "run"))
    monkeypatch.setenv("FAKE_VPN_LOG", str(tmp_path / "vpn.log"))
    monkeypatch.delenv("FAKE_VPN_TARGET", raising=False)
    monkeypatch.setattr(vpn_android, "UP_TIMEOUT", 15)
    (tmp_path / "run").mkdir()
    yield tmp_path
    vpn_android._stop_all()


def cluster(cid="wulver", host="login.example.edu") -> ClusterConfig:
    cfg = ClusterConfig(id=cid, name=cid.title(), host=host)
    cfg.vpn.enabled = True
    cfg.vpn.gateway = "vpn.example.edu"
    cfg.vpn.useragent = "AnyConnect Linux_64 4.10.07061"
    return cfg


AUTH = {"COOKIE": COOKIE, "HOST": "vpn.example.edu", "FINGERPRINT": "pin-sha256:abc=",
        "RESOLVE": "vpn.example.edu:192.0.2.1"}


def test_argv_has_the_pin_and_ocproxy_but_never_the_cookie():
    cfg = cluster()
    argv = vpn_android.tunnel_argv(cfg, AUTH, "/lib/libhpchub_openconnect.so", "/lib/libhpchub_ocproxy.so", 4242,
                                   ["--cafile", "/data/cacerts.pem"])
    assert COOKIE not in " ".join(argv)
    assert argv[0] == "/lib/libhpchub_openconnect.so" and argv[-1] == "https://vpn.example.edu"
    assert "--cookie-on-stdin" in argv and "--script-tun" in argv
    assert argv[argv.index("--script") + 1] == "/lib/libhpchub_ocproxy.so -L 4242:login.example.edu:22 -k 30"
    assert argv[argv.index("--servercert") + 1] == "pin-sha256:abc="
    assert argv[argv.index("--resolve") + 1] == "vpn.example.edu:192.0.2.1"
    assert argv[argv.index("--useragent") + 1] == "AnyConnect Linux_64 4.10.07061"
    assert argv[argv.index("--cafile") + 1] == "/data/cacerts.pem"


def test_up_gives_ssh_a_local_port_and_down_takes_it_away(fake_vpn):
    lines: list[str] = []
    vpn = vpn_android.AndroidVpn(cluster(), lines.append)
    vpn.ensure_profile()
    assert not vpn.is_active()
    vpn.up(AUTH)
    port = tunnels.local_port("login.example.edu", 22)
    assert port and vpn_android.ssh_answers(port)
    assert vpn.is_active()
    assert "vpn: Connected as 10.0.0.2, using SSL" in lines
    log = (fake_vpn / "vpn.log").read_text()
    assert f"script {vpn_android.OCPROXY} forwards {port} to login.example.edu:22" in log
    assert COOKIE not in log and not any(COOKIE in line for line in lines)

    # a restarted backend (nothing in memory) finds it from its note
    vpn_android._started.clear()
    tunnels.drop("login.example.edu", 22)
    assert vpn_android.AndroidVpn(cluster(), print).is_active()
    assert tunnels.local_port("login.example.edu", 22) == port

    vpn.down()
    assert "SIGTERM" in (fake_vpn / "vpn.log").read_text()
    assert not vpn.is_active() and tunnels.local_port("login.example.edu", 22) is None
    assert not (fake_vpn / "run" / "hpc-hub" / "vpn-wulver.json").exists()


def test_two_clusters_at_once_each_on_its_own_port(fake_vpn):
    wulver = vpn_android.AndroidVpn(cluster("wulver", "login.example.edu"), print)
    yale = vpn_android.AndroidVpn(cluster("yale", "cluster.example.org"), print)
    wulver.up(AUTH)
    yale.up(AUTH)
    a, b = tunnels.local_port("login.example.edu", 22), tunnels.local_port("cluster.example.org", 22)
    assert a and b and a != b
    wulver.down()
    assert yale.is_active() and not wulver.is_active()
    yale.down()


def test_a_tunnel_that_stops_says_why(fake_vpn, monkeypatch):
    monkeypatch.setenv("FAKE_VPN_FAIL", "Failed to connect to vpn.example.edu: Connection refused")
    vpn = vpn_android.AndroidVpn(cluster(), print)
    with pytest.raises(VpnError, match="did not come up: Failed to connect to vpn.example.edu"):
        vpn.up(AUTH)
    assert not vpn.is_active() and tunnels.local_port("login.example.edu", 22) is None


def test_a_rejected_cookie_is_an_error(fake_vpn):
    vpn = vpn_android.AndroidVpn(cluster(), print)
    with pytest.raises(VpnError, match="Cookie was rejected"):
        vpn.up({**AUTH, "COOKIE": "wrong"})


def test_no_answer_through_the_tunnel_times_out(fake_vpn, monkeypatch):
    with socket.create_server(("127.0.0.1", 0)) as silent:  # accepts, never greets
        monkeypatch.setenv("FAKE_VPN_TARGET", f"127.0.0.1:{silent.getsockname()[1]}")
        monkeypatch.setattr(vpn_android, "UP_TIMEOUT", 3)
        vpn = vpn_android.AndroidVpn(cluster(), print)
        with pytest.raises(VpnError, match="did not answer through it"):
            vpn.up(AUTH)
    assert not vpn.is_active()


def test_a_stale_note_is_not_a_tunnel(fake_vpn):
    note = fake_vpn / "run" / "hpc-hub" / "vpn-wulver.json"
    note.parent.mkdir(parents=True, exist_ok=True)
    note.write_text(f'{{"pid": {os.getpid()}, "port": 1}}')  # a pid that is not openconnect
    vpn = vpn_android.AndroidVpn(cluster(), print)
    assert not vpn.is_active()
    vpn.down()  # leaves that process alone
    assert not note.exists()


def test_without_the_programs_it_says_so(tmp_path, monkeypatch):
    monkeypatch.setenv("HPC_HUB_VPN_DIR", str(tmp_path))
    with pytest.raises(VpnError) as e:
        vpn_android.AndroidVpn(cluster(), print).ensure_profile()
    assert str(e.value) == vpn_android.NO_VPN


def test_password_gateways_sign_in_with_the_same_openconnect(fake_vpn):
    vpn = vpn_android.AndroidVpn(cluster(), print)
    vpn.extra_args = []
    auth = vpn.authenticate("jdoe", "pw", ask=lambda p: None, on_duo=lambda: None)
    assert auth["COOKIE"] == COOKIE and auth["FINGERPRINT"] == "pin-sha256:abc="


def test_session_on_the_phone_connects_ssh_through_the_tunnel(fake_vpn, sshd, monkeypatch):
    """Connect on Android: the gateway answers, openconnect signs in, the tunnel comes up, SSH goes through it
    to a cluster whose name resolves nowhere, and Disconnect stops the tunnel."""
    from hpc_hub.connect import session as session_mod
    from hpc_hub.connect.askpass_server import AskpassServer
    from hpc_hub.connect.session import ClusterSession, State
    from hpc_hub.core.credentials import Login
    from tests import fake_sshd

    monkeypatch.setattr(session_mod.sys, "platform", "android")
    monkeypatch.setenv("FAKE_VPN_TARGET", f"127.0.0.1:{sshd.port}")
    server = AskpassServer()
    server.start()
    done = threading.Event()
    states, lines = [], []

    class Listener:
        def state_changed(self, s):
            states.append((s.state, s.detail))
            if s.state in (State.CONNECTED, State.ERROR, State.DISCONNECTED):
                done.set()

        def log(self, s, line):
            lines.append(line)

        def ask(self, s, prompt):
            return None

    try:
        with socket.create_server(("127.0.0.1", 0)) as gateway:
            cfg = cluster(host="cluster.invalid")
            cfg.request_node_on_connect = False
            cfg.vpn.gateway = f"127.0.0.1:{gateway.getsockname()[1]}"
            s = ClusterSession(cfg, server, Listener())
            s.connect(Login("jdoe", fake_sshd.PASSWORD), Login("jdoe", "pw"))
            assert done.wait(60)
        assert s.state == State.CONNECTED, "\n".join(lines)
        assert (State.VPN, "Starting tunnel") in states and s.vpn_used
        assert "VPN connected" in lines and "SSH session ready" in lines
        assert s.ssh.run("echo hi").stdout.strip() == "hi"
        done.clear()
        s.disconnect()
        assert done.wait(30) and s.state == State.DISCONNECTED
        assert tunnels.local_port("cluster.invalid", 22) is None
        assert "SIGTERM" in (fake_vpn / "vpn.log").read_text()
    finally:
        server.stop()
