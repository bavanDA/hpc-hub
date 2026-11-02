"""The phone's VPN end to end on a Linux computer, against a fake AnyConnect gateway, in a network namespace of its
own (no root, no real VPN):

  AndroidVpn.up -> openconnect --cookie-on-stdin --script-tun -> ocproxy -L port:cluster.example.test:22
  -> CSTP over TLS -> this fake gateway -> tun0 (10.9.0.1) -> the fake sshd of tests/fake_sshd.py

then an asyncssh login through it (the host key under the cluster's name), two clusters at once, and down().

    mobile/vpn/build.sh host
    unshare -rn <python with asyncssh> mobile/vpn/fake_gateway.py . mobile/build/vpn/host/out
"""

import datetime
import fcntl
import os
import select
import socket
import ssl
import struct
import subprocess
import sys
import tempfile
import threading
import time
from pathlib import Path

REPO, BIN = Path(sys.argv[1]).resolve(), Path(sys.argv[2]).resolve()
sys.path.insert(0, str(REPO))
TMP = Path(tempfile.mkdtemp(prefix="vpn-e2e-"))
os.environ.update(XDG_RUNTIME_DIR=str(TMP / "run"), XDG_CACHE_HOME=str(TMP / "cache"), HOME=str(TMP / "home"),
                  HPC_HUB_SSH="asyncssh")
for d in ("run", "cache", "home", "lib"):
    (TMP / d).mkdir()
COOKIE = "abc123-fake-cookie"
GW_IP, CLIENT_IP = "10.9.0.1", "10.9.0.2"
seen = {"connects": 0, "bye": 0, "bad_cookie": 0, "dns": []}


def sh(*cmd):
    subprocess.run(cmd, check=True)


# -- network: loopback and a tun device for the "campus" side ----------------------------------------
sh("ip", "link", "set", "lo", "up")
TUNSETIFF, IFF_TUN, IFF_NO_PI = 0x400454CA, 0x0001, 0x1000
tun = os.open("/dev/net/tun", os.O_RDWR)
fcntl.ioctl(tun, TUNSETIFF, struct.pack("16sH", b"tun0", IFF_TUN | IFF_NO_PI))
sh("ip", "addr", "add", f"{GW_IP}/24", "dev", "tun0")
sh("ip", "link", "set", "tun0", "up")

# -- the cluster: fake sshd on 127.0.0.1, reachable as 10.9.0.1:22 ---------------------------------------
from hpc_hub.core import ssh_async  # noqa: E402
from tests import fake_sshd  # noqa: E402

ssh_async.KNOWN_HOSTS = TMP / "known_hosts"
ssh_async.OPTIONS = {"client_keys": None, "agent_path": None, "config": []}
sshd = fake_sshd.FakeSshd(TMP / "remote")
sshd.start()


def relay(listen_ip, port, to_port):
    srv = socket.create_server((listen_ip, port))

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

    def accept():
        while True:
            c, _ = srv.accept()
            u = socket.create_connection(("127.0.0.1", to_port))
            for a, b in ((c, u), (u, c)):
                threading.Thread(target=pipe, args=(a, b), daemon=True).start()

    threading.Thread(target=accept, daemon=True).start()


relay(GW_IP, 22, sshd.port)


# -- DNS on 10.9.0.1:53: *.example.test -> 10.9.0.1 -----------------------------------------------------
def dns():
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    s.bind((GW_IP, 53))
    while True:
        q, addr = s.recvfrom(512)
        tid, qd = q[:2], q[12:]
        end = qd.index(b"\0") + 5
        labels, i = [], 0
        while qd[i]:
            labels.append(qd[i + 1:i + 1 + qd[i]].decode())
            i += qd[i] + 1
        name = ".".join(labels)
        seen["dns"].append(name)
        ok = name.endswith("example.test")
        flags = b"\x81\x80" if ok else b"\x81\x83"
        head = tid + flags + b"\x00\x01" + (b"\x00\x01" if ok else b"\x00\x00") + b"\x00\x00\x00\x00"
        ans = (b"\xc0\x0c\x00\x01\x00\x01\x00\x00\x00\x3c\x00\x04" + socket.inet_aton(GW_IP)) if ok else b""
        s.sendto(head + qd[:end] + ans, addr)


threading.Thread(target=dns, daemon=True).start()

# -- the gateway: TLS, CONNECT with the cookie, then CSTP <-> tun0 --------------------------------------
from cryptography import x509  # noqa: E402
from cryptography.hazmat.primitives import hashes, serialization  # noqa: E402
from cryptography.hazmat.primitives.asymmetric import ec  # noqa: E402
from cryptography.x509.oid import NameOID  # noqa: E402

key = ec.generate_private_key(ec.SECP256R1())
name = x509.Name([x509.NameAttribute(NameOID.COMMON_NAME, "vpn.example.test")])
now = datetime.datetime.now(datetime.UTC)
cert = (x509.CertificateBuilder().subject_name(name).issuer_name(name).public_key(key.public_key())
        .serial_number(1).not_valid_before(now - datetime.timedelta(days=1))
        .not_valid_after(now + datetime.timedelta(days=1)).sign(key, hashes.SHA256()))
(TMP / "gw.pem").write_bytes(cert.public_bytes(serialization.Encoding.PEM))
(TMP / "gw.key").write_bytes(key.private_bytes(serialization.Encoding.PEM, serialization.PrivateFormat.PKCS8,
                                               serialization.NoEncryption()))
import base64  # noqa: E402
import hashlib  # noqa: E402

spki = key.public_key().public_bytes(serialization.Encoding.DER, serialization.PublicFormat.SubjectPublicKeyInfo)
PIN = "pin-sha256:" + base64.b64encode(hashlib.sha256(spki).digest()).decode()
ctx = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
ctx.load_cert_chain(TMP / "gw.pem", TMP / "gw.key")
gw = socket.create_server(("127.0.0.1", 0))
GW_PORT = gw.getsockname()[1]
tun_lock = threading.Lock()
clients: list = []  # live CSTP sessions; packets from tun0 go to the one whose address they are for


def read_headers(c) -> tuple[str, dict]:
    data = b""
    while b"\r\n\r\n" not in data:
        chunk = c.recv(4096)
        if not chunk:
            break
        data += chunk
    head = data.split(b"\r\n\r\n")[0].decode(errors="replace").split("\r\n")
    headers = {}
    for line in head[1:]:
        k, _, v = line.partition(":")
        headers[k.strip().lower()] = v.strip()
    return head[0], headers


def session(raw):
    c = ctx.wrap_socket(raw, server_side=True)
    line, h = read_headers(c)
    if not line.startswith("CONNECT"):
        c.sendall(b"HTTP/1.1 200 OK\r\nContent-Length: 0\r\nConnection: close\r\n\r\n")  # logout etc.
        c.close()
        return
    cookies = dict(p.strip().split("=", 1) for p in h.get("cookie", "").split(";") if "=" in p)
    if cookies.get("webvpn") != COOKIE:
        seen["bad_cookie"] += 1
        c.sendall(b"HTTP/1.1 401 Unauthorized\r\nContent-Length: 0\r\n\r\n")
        c.close()
        return
    seen["connects"] += 1
    ip = f"10.9.0.{1 + seen['connects']}"
    c.sendall(("HTTP/1.1 200 CONNECTED\r\nX-CSTP-Version: 1\r\n"
               f"X-CSTP-Address: {ip}\r\nX-CSTP-Netmask: 255.255.255.0\r\nX-CSTP-DNS: {GW_IP}\r\n"
               "X-CSTP-MTU: 1300\r\nX-CSTP-Keepalive: 20\r\nX-CSTP-DPD: 30\r\nX-CSTP-Idle-Timeout: none\r\n"
               "X-CSTP-Default-Domain: example.test\r\nX-CSTP-Split-Include: 10.9.0.0/255.255.255.0\r\n"
               "\r\n").encode())
    me = {"ip": socket.inet_aton(ip), "sock": c, "lock": threading.Lock()}
    clients.append(me)
    buf = b""
    try:
        while True:
            data = c.recv(65536)
            if not data:
                break
            buf += data
            while len(buf) >= 8:
                if buf[:4] != b"STF\x01":
                    raise RuntimeError(f"bad CSTP header {buf[:8]!r}")
                n, kind = struct.unpack(">H", buf[4:6])[0], buf[6]
                if len(buf) < 8 + n:
                    break
                payload, buf = buf[8:8 + n], buf[8 + n:]
                if kind == 0:
                    with tun_lock:
                        os.write(tun, payload)
                elif kind == 3:  # DPD request
                    with me["lock"]:
                        c.sendall(b"STF\x01\x00\x00\x04\x00")
                elif kind == 5:
                    seen["bye"] += 1
                    raise EOFError
    except (OSError, EOFError, ssl.SSLError):
        pass
    finally:
        clients.remove(me)
        c.close()


def from_tun():
    while True:
        r, _, _ = select.select([tun], [], [])
        pkt = os.read(tun, 4096)
        if len(pkt) < 20:
            continue
        dst = pkt[16:20]
        for cl in list(clients):
            if cl["ip"] == dst:
                with cl["lock"]:
                    try:
                        cl["sock"].sendall(b"STF\x01" + struct.pack(">H", len(pkt)) + b"\x00\x00" + pkt)
                    except OSError:
                        pass


def accept():
    while True:
        raw, _ = gw.accept()
        threading.Thread(target=session, args=(raw,), daemon=True).start()


threading.Thread(target=accept, daemon=True).start()
threading.Thread(target=from_tun, daemon=True).start()

# -- the app's side -----------------------------------------------------------------------------------
for name, real in (("libhpchub_openconnect.so", "openconnect"), ("libhpchub_ocproxy.so", "ocproxy")):
    (TMP / "lib" / name).symlink_to(BIN / real)
os.environ["HPC_HUB_VPN_DIR"] = str(TMP / "lib")

from hpc_hub.connect import vpn_android  # noqa: E402
from hpc_hub.connect.vpn import VpnError  # noqa: E402
from hpc_hub.core import tunnels  # noqa: E402
from hpc_hub.core.config import ClusterConfig  # noqa: E402


def cluster(cid, host):
    cfg = ClusterConfig(id=cid, name=cid, host=host)
    cfg.vpn.enabled, cfg.vpn.gateway, cfg.vpn.useragent = True, f"127.0.0.1:{GW_PORT}", "AnyConnect Linux_64 4.10.07061"
    return cfg


def answers(prompt):
    from hpc_hub.connect import prompts
    kind = prompts.classify(prompt)
    if kind == prompts.PASSWORD:
        return fake_sshd.PASSWORD
    if kind == prompts.DUO:
        return prompts.duo_reply(prompt, "push")
    return None


AUTH = {"COOKIE": COOKIE, "HOST": f"127.0.0.1:{GW_PORT}", "FINGERPRINT": PIN}
lines: list[str] = []
ok = True


def check(what, cond):
    global ok
    print(("PASS " if cond else "FAIL ") + what, flush=True)
    ok = ok and bool(cond)


a = vpn_android.AndroidVpn(cluster("wulver", "cluster.example.test"), lines.append)
a.extra_args = []
t0 = time.monotonic()
a.up(AUTH)
check(f"tunnel up in {time.monotonic() - t0:.1f} s, SSH banner through it", True)
check("ocproxy resolved the cluster through the VPN's DNS", "cluster.example.test" in seen["dns"])
port = tunnels.local_port("cluster.example.test", 22)
m = ssh_async.AsyncSshMaster(cluster("wulver", "cluster.example.test"), "jdoe", {}, lines.append, ask=answers)
m.start(timeout=30)
check("asyncssh login through the tunnel", m.run("echo hi").stdout.strip() == "hi")
check("host key saved under the cluster's name",
      ssh_async.KNOWN_HOSTS.read_text().startswith("cluster.example.test ssh-ed25519 "))
big = m.run("head -c 3000000 /dev/zero | base64 | wc -c", timeout=60).stdout.strip()
check(f"3 MB through the tunnel ({big} bytes)", big and int(big) > 4_000_000)

b = vpn_android.AndroidVpn(cluster("yale", "other.example.test"), lines.append)
b.extra_args = []
b.up(AUTH)
pb = tunnels.local_port("other.example.test", 22)
check(f"second cluster at the same time, its own port ({port} and {pb})", pb and pb != port and a.is_active())
m2 = ssh_async.AsyncSshMaster(cluster("yale", "other.example.test"), "jdoe", {}, lines.append, ask=answers)
m2.start(timeout=30)
check("second login works", m2.run("echo two").stdout.strip() == "two" and m.run("echo one").stdout.strip() == "one")
m2.stop()
m.stop()

bad = vpn_android.AndroidVpn(cluster("bad", "x.example.test"), lines.append)
bad.extra_args = []
try:
    bad.up({**AUTH, "COOKIE": "wrong"})
    check("a wrong cookie is refused", False)
except VpnError as e:
    check(f"a wrong cookie is refused: {e}", seen["bad_cookie"] >= 1)

a.down()
b.down()
time.sleep(2)
ps = subprocess.run(["ps", "-eo", "pid,args"], capture_output=True, text=True).stdout
check("openconnect and ocproxy are gone after down()", "libhpchub_" not in ps and "ocproxy" not in ps)
check(f"openconnect said goodbye to the gateway ({seen['bye']} times)", seen["bye"] >= 2)
check("no cookie in the log", not any(COOKIE in line for line in lines))
print("\n".join(line for line in lines if line.startswith("vpn:"))[-3000:])
sshd.stop()
print("ALL PASSED" if ok else "SOME FAILED")
sys.exit(0 if ok else 1)
