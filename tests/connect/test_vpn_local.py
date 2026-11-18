"""The VPN without administrator (connect/vpn_local.py), end to end with the real programs: openconnect signs in
to a make-believe AnyConnect server (TLS, then CSTP packets) with --script-tun, hands the tunnel to
hpc-hub-vpn-tunnel, and SSH's local port reaches a make-believe cluster behind the server (the far_side example
of app/vpn-helper: a TCP/IP stack with an SSH-like server and DNS). No real VPN, no administrator.

Needs openconnect (on PATH, or HPC_HUB_TEST_OPENCONNECT) and the two Rust programs built
(`cargo build --bin hpc-hub-vpn-tunnel --example far_side` in app/vpn-helper); skipped without them. On Windows,
HPC_HUB_TEST_OPENCONNECT is the patched openconnect.exe, in its folder of DLLs."""

import base64
import datetime
import hashlib
import os
import shutil
import socket
import ssl
import struct
import subprocess
import sys
import threading
import time
from pathlib import Path

import pytest

from hpc_hub.connect import vpn_android, vpn_helper, vpn_local
from hpc_hub.core import config, tunnels
from hpc_hub.core.config import ClusterConfig

ROOT = Path(__file__).resolve().parents[2]
EXE = ".exe" if sys.platform == "win32" else ""
COOKIE = "abc123-not-a-real-cookie"


def _built(name: str) -> Path | None:
    for kind in ("debug", "release"):
        p = ROOT / "app" / "vpn-helper" / "target" / kind / name
        if p.is_file():
            return p
    return None


OPENCONNECT = os.environ.get("HPC_HUB_TEST_OPENCONNECT") or shutil.which("openconnect")
TUNNEL = _built(f"hpc-hub-vpn-tunnel{EXE}")
FAR_SIDE = _built(f"examples/far_side{EXE}")
HAVE = bool(OPENCONNECT and TUNNEL and FAR_SIDE)
if os.environ.get("HPC_HUB_TEST_OPENCONNECT") and not HAVE:  # CI asked for it: missing programs are a failure
    raise RuntimeError(f"test_vpn_local needs the tunnel and far_side built (found {TUNNEL}, {FAR_SIDE})")
real = pytest.mark.skipif(not HAVE, reason="needs openconnect and app/vpn-helper's tunnel and far_side built")


# -- a make-believe AnyConnect server --------------------------------------------------------------------

def _certificate(folder: Path) -> tuple[Path, Path, str]:
    """A self-signed certificate for vpn.example.edu, and openconnect's pin for it."""
    from cryptography import x509
    from cryptography.hazmat.primitives import hashes, serialization
    from cryptography.hazmat.primitives.asymmetric import ec
    from cryptography.x509.oid import NameOID

    key = ec.generate_private_key(ec.SECP256R1())
    name = x509.Name([x509.NameAttribute(NameOID.COMMON_NAME, "vpn.example.edu")])
    now = datetime.datetime.now(datetime.timezone.utc)
    cert = (x509.CertificateBuilder().subject_name(name).issuer_name(name).public_key(key.public_key())
            .serial_number(1).not_valid_before(now - datetime.timedelta(days=1))
            .not_valid_after(now + datetime.timedelta(days=1))
            .add_extension(x509.SubjectAlternativeName([x509.DNSName("vpn.example.edu")]), critical=False)
            .sign(key, hashes.SHA256()))
    cert_file, key_file = folder / "cert.pem", folder / "key.pem"
    cert_file.write_bytes(cert.public_bytes(serialization.Encoding.PEM))
    key_file.write_bytes(key.private_bytes(serialization.Encoding.PEM, serialization.PrivateFormat.PKCS8,
                                           serialization.NoEncryption()))
    spki = cert.public_key().public_bytes(serialization.Encoding.DER, serialization.PublicFormat.SubjectPublicKeyInfo)
    return cert_file, key_file, "pin-sha256:" + base64.b64encode(hashlib.sha256(spki).digest()).decode()


CONNECTED = ("HTTP/1.1 200 CONNECTED\r\nX-CSTP-Version: 1\r\nX-CSTP-Address: 10.9.0.10\r\n"
             "X-CSTP-Netmask: 255.255.255.0\r\nX-CSTP-DNS: 10.9.0.53\r\nX-CSTP-Default-Domain: example.edu\r\n"
             "X-CSTP-MTU: 1300\r\nX-CSTP-Base-MTU: 1400\r\nX-CSTP-Keepalive: 20\r\nX-CSTP-DPD: 30\r\n"
             "X-CSTP-Lease-Duration: 1209600\r\nX-CSTP-Session-Timeout: none\r\nX-CSTP-Idle-Timeout: none\r\n"
             "X-CSTP-Disconnected-Timeout: none\r\nX-CSTP-Keep: true\r\nX-CSTP-Rekey-Method: none\r\n\r\n")


class FakeVpnServer:
    """TLS on a local port. CONNECT /CSCOSSLC/tunnel with the right cookie: CSTP, its data packets to and from the
    far side. Anything else (the logout page): 200, nothing."""

    def __init__(self, folder: Path):
        cert, key, self.pin = _certificate(folder)
        self.ctx = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
        self.ctx.load_cert_chain(cert, key)
        self.listener = socket.create_server(("127.0.0.1", 0))
        self.port = self.listener.getsockname()[1]
        self.seen: list[str] = []  # "tunnel", "bye" (CSTP disconnect), "GET /path"
        self.far: list[subprocess.Popen] = []
        threading.Thread(target=self._serve, daemon=True).start()

    def _serve(self) -> None:
        while True:
            try:
                raw, _ = self.listener.accept()
            except OSError:
                return
            threading.Thread(target=self._client, args=(raw,), daemon=True).start()

    def _client(self, raw: socket.socket) -> None:
        try:
            conn = self.ctx.wrap_socket(raw, server_side=True)
            head = b""
            while b"\r\n\r\n" not in head:
                chunk = conn.recv(4096)
                if not chunk:
                    return
                head += chunk
            request = head.decode(errors="replace")
            first = request.split("\r\n", 1)[0]
            if first.startswith("CONNECT /CSCOSSLC/tunnel") and f"webvpn={COOKIE}" in request:
                self.seen.append("tunnel")
                conn.sendall(CONNECTED.encode())
                self._tunnel(conn, head.split(b"\r\n\r\n", 1)[1])
            else:
                self.seen.append(" ".join(first.split()[:2]))
                conn.sendall(b"HTTP/1.1 200 OK\r\nContent-Length: 0\r\nConnection: close\r\n\r\n")
                conn.close()
        except (OSError, ssl.SSLError):
            pass

    def _tunnel(self, conn: ssl.SSLSocket, rest: bytes) -> None:
        far = subprocess.Popen([str(FAR_SIDE)], stdin=subprocess.PIPE, stdout=subprocess.PIPE)
        self.far.append(far)
        lock = threading.Lock()  # one TLS call at a time

        def send(kind: int, payload: bytes = b"") -> None:
            with lock:
                conn.sendall(b"STF\x01" + struct.pack(">H", len(payload)) + bytes([kind, 0]) + payload)

        def from_far() -> None:
            try:
                while len(head := far.stdout.read(2)) == 2:
                    send(0, far.stdout.read(struct.unpack(">H", head)[0]))
            except (OSError, ssl.SSLError):
                pass

        threading.Thread(target=from_far, daemon=True).start()
        conn.settimeout(0.02)
        buf = rest
        try:
            while True:
                while len(buf) >= 8 and buf.startswith(b"STF\x01"):
                    size, kind = struct.unpack(">H", buf[4:6])[0], buf[6]
                    if len(buf) < 8 + size:
                        break
                    payload, buf = buf[8:8 + size], buf[8 + size:]
                    if kind == 0:  # data: an IP packet for the far side
                        far.stdin.write(struct.pack(">H", len(payload)) + payload)
                        far.stdin.flush()
                    elif kind == 3:  # dead peer detection request
                        send(4)
                    elif kind == 5:  # disconnect: openconnect logged out
                        self.seen.append("bye")
                        return
                try:
                    with lock:
                        chunk = conn.recv(65536)
                except (TimeoutError, socket.timeout, ssl.SSLWantReadError):
                    continue
                if not chunk:
                    return
                buf += chunk
        except (OSError, ssl.SSLError):
            pass
        finally:
            far.kill()
            conn.close()

    def close(self) -> None:
        self.listener.close()
        for p in self.far:
            p.kill()


@pytest.fixture
def server(tmp_path, monkeypatch):
    folder = tmp_path / "vpn"
    if sys.platform == "win32":  # openconnect.exe with its DLLs, and the tunnel beside it
        shutil.copytree(Path(OPENCONNECT).parent, folder)
        shutil.copy(TUNNEL, folder / vpn_local.TUNNEL)
    else:
        folder.mkdir()
        (folder / vpn_local.OPENCONNECT).symlink_to(OPENCONNECT)
        (folder / vpn_local.TUNNEL).symlink_to(TUNNEL)
    monkeypatch.setenv("HPC_HUB_VPN_DIR", str(folder))
    monkeypatch.setenv("XDG_RUNTIME_DIR", str(tmp_path / "run"))
    (tmp_path / "run").mkdir()
    s = FakeVpnServer(tmp_path)
    yield s
    vpn_android._stop_all()
    s.close()


def cluster(gateway: str) -> ClusterConfig:
    cfg = ClusterConfig(id="wulver", name="Wulver", host="login.example.edu")
    cfg.vpn.enabled = True
    cfg.vpn.gateway = gateway
    return cfg


@real
def test_ssh_reaches_the_cluster_through_hpc_hubs_own_vpn(server):
    lines: list[str] = []
    gateway = f"vpn.example.edu:{server.port}"
    vpn = vpn_local.LocalVpn(cluster(gateway), lines.append)
    vpn.ensure_profile()
    assert not vpn.is_active()
    vpn.up({"COOKIE": COOKIE, "HOST": gateway, "FINGERPRINT": server.pin,
            "RESOLVE": "vpn.example.edu:127.0.0.1"})
    port = tunnels.local_port("login.example.edu", 22)
    assert port and vpn.is_active()
    assert server.seen == ["tunnel"]

    with socket.create_connection(("127.0.0.1", port), timeout=10) as c:
        f = c.makefile("rwb")
        assert f.readline() == b"SSH-2.0-far-side\r\n"
        f.write(b"hello through the tunnel\n")
        f.flush()
        assert f.readline() == b"hello through the tunnel\n"
    assert not any(COOKIE in line for line in lines)

    vpn.down()
    deadline = time.monotonic() + 10
    while "bye" not in server.seen and time.monotonic() < deadline:
        time.sleep(0.1)
    assert "bye" in server.seen, f"openconnect didn't log out: {server.seen} {lines[-5:]}"
    assert not vpn.is_active() and tunnels.local_port("login.example.edu", 22) is None


# -- choosing it (no real programs needed) ---------------------------------------------------------------

@pytest.fixture
def windows(tmp_path, monkeypatch):
    """A Windows of make-believe: the two programs in a folder, app.toml in tmp_path."""
    folder = tmp_path / "vpn"
    folder.mkdir()
    for name in ("openconnect.exe", "hpc-hub-vpn-tunnel.exe"):
        (folder / name).write_text("")
    monkeypatch.setattr(vpn_local, "WINDOWS", True)
    monkeypatch.setattr(vpn_local, "OPENCONNECT", "openconnect.exe")
    monkeypatch.setattr(vpn_local, "TUNNEL", "hpc-hub-vpn-tunnel.exe")
    monkeypatch.setenv("HPC_HUB_VPN_DIR", str(folder))
    monkeypatch.setattr(config, "APP_FILE", tmp_path / "app.toml")
    monkeypatch.setattr(vpn_helper, "installed_version", lambda address=None: None)
    return folder


def test_a_standard_windows_account_gets_hpc_hubs_own_vpn(windows, monkeypatch):
    cfg = cluster("vpn.example.edu")
    monkeypatch.setattr(vpn_helper, "standard_user", lambda: True)
    assert vpn_local.used(cfg)
    monkeypatch.setattr(vpn_helper, "installed_version", lambda address=None: vpn_helper.VERSION)
    assert not vpn_local.used(cfg)  # IT installed the helper for it: the full VPN


def test_an_administrator_gets_it_after_saying_not_now(windows, monkeypatch):
    cfg = cluster("vpn.example.edu")
    monkeypatch.setattr(vpn_helper, "standard_user", lambda: False)
    assert not vpn_local.used(cfg)
    vpn_local.choose()
    assert vpn_local.used(cfg) and config.load_app(config.APP_FILE).own_vpn


def test_never_without_its_programs_or_off_windows(windows, monkeypatch):
    cfg = cluster("vpn.example.edu")
    monkeypatch.setattr(vpn_helper, "standard_user", lambda: True)
    (windows / "hpc-hub-vpn-tunnel.exe").unlink()
    assert not vpn_local.used(cfg)
    (windows / "hpc-hub-vpn-tunnel.exe").write_text("")
    monkeypatch.setattr(vpn_local, "WINDOWS", False)
    assert not vpn_local.used(cfg)


def test_the_helpers_prompt_offers_it_and_not_now_chooses_it(windows, monkeypatch):
    monkeypatch.setattr(vpn_helper, "WINDOWS", True)
    monkeypatch.setattr(vpn_helper, "standard_user", lambda: False)
    asked: list[str] = []
    vpn = vpn_helper.HelperVpn(cluster("vpn.example.edu"), print,
                               lambda title, text: asked.append(text) or False)
    with pytest.raises(vpn_helper.UseOwnVpn):
        vpn.ensure_profile()
    assert "Not now: HPC Hub uses its own VPN" in asked[0]


def test_the_forwarder_is_quoted_for_windows(windows, tmp_path, monkeypatch):
    monkeypatch.setattr(vpn_local, "WINDOWS", True)
    monkeypatch.setenv("XDG_RUNTIME_DIR", str(tmp_path / "run"))
    (tmp_path / "run").mkdir()
    vpn = vpn_local.LocalVpn(cluster("vpn.example.edu"), print)
    vpn.ocproxy = r"C:\Users\jdoe\AppData\Local\HPC Hub\vpn\hpc-hub-vpn-tunnel.exe"
    script = vpn.script(52011)
    assert script.startswith('"C:\\Users\\jdoe\\AppData\\Local\\HPC Hub\\vpn\\hpc-hub-vpn-tunnel.exe" -L '
                             "52011:login.example.edu:22 -k 30 --pid-file ")
