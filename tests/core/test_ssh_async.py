"""The asyncssh login (Windows' SSH) against an SSH server in this process (tests/fake_sshd.py)."""

import socket
import subprocess
import threading
import time
from concurrent.futures import ThreadPoolExecutor

import pytest

asyncssh = pytest.importorskip("asyncssh")

from hpc_hub.connect import prompts  # noqa: E402
from hpc_hub.core import ssh, ssh_async  # noqa: E402
from hpc_hub.core.config import ClusterConfig  # noqa: E402
from tests import fake_sshd  # noqa: E402


def answers(asked: list[str]):
    """What the session answers: the password, then "push" turned into Duo's menu number."""
    def ask(prompt: str) -> str | None:
        asked.append(prompt)
        kind = prompts.classify(prompt)
        if kind == prompts.PASSWORD:
            return fake_sshd.PASSWORD
        if kind == prompts.DUO:
            return prompts.duo_reply(prompt, "push")
        return None
    return ask


def login(sshd, ask, user="u") -> ssh_async.AsyncSshMaster:
    cfg = ClusterConfig(id="t", name="Test", host="127.0.0.1", port=sshd.port)
    lines: list[str] = []
    master = ssh_async.AsyncSshMaster(cfg, user, {}, lines.append, ask=ask)  # never OpenSSH: not your ~/.ssh
    master.lines = lines
    master.start(timeout=30)
    return master


@pytest.fixture
def master(sshd):
    m = login(sshd, answers([]))
    yield m
    m.stop()


def test_picks_asyncssh_on_windows(monkeypatch):
    monkeypatch.delenv("HPC_HUB_SSH", raising=False)
    cfg = ClusterConfig(id="t", name="Test", host="h")
    monkeypatch.setattr(ssh, "WINDOWS", False)
    assert type(ssh.new_master(cfg, "u", {}, print)) is ssh.SshMaster
    monkeypatch.setattr(ssh, "WINDOWS", True)
    assert isinstance(ssh.new_master(cfg, "u", {}, print), ssh_async.AsyncSshMaster)
    monkeypatch.setattr(ssh, "WINDOWS", False)
    monkeypatch.setenv("HPC_HUB_SSH", "asyncssh")
    assert isinstance(ssh.new_master(cfg, "u", {}, print), ssh_async.AsyncSshMaster)


def test_password_then_duo_push(sshd):
    asked: list[str] = []
    m = login(sshd, answers(asked))
    try:
        assert m.alive()
        assert asked == ["Password: ", fake_sshd.DUO]
        assert sshd.duo == [["1"]]  # "push" became Duo's menu number
        assert any("Permanently added" in line for line in m.lines)
        assert f"[127.0.0.1]:{sshd.port} ssh-ed25519 " in ssh_async.KNOWN_HOSTS.read_text()
    finally:
        m.stop()
    assert not m.alive()
    assert m.run("true").returncode == 255


def test_plain_password_auth(sshd):
    sshd.mode = "password"
    asked: list[str] = []
    m = login(sshd, answers(asked))
    m.stop()
    assert asked == ["u@127.0.0.1's password: "]  # as OpenSSH asks, so the session knows it


def test_refused_answer_is_permission_denied(sshd):
    with pytest.raises(ssh.SshError, match="Permission denied"):
        login(sshd, lambda prompt: "wrong" if "Password" in prompt else None)
    with pytest.raises(ssh.SshError, match="Permission denied"):
        login(sshd, lambda prompt: None)  # the session refusing (asked twice, or cancelled)


def test_a_picked_key_that_is_gone_does_not_stop_the_login(sshd, tmp_path):
    cfg = ClusterConfig(id="t", name="Test", host="127.0.0.1", port=sshd.port, ssh_key=str(tmp_path / "id_ed25519"))
    lines: list[str] = []
    m = ssh_async.AsyncSshMaster(cfg, "u", {}, lines.append, ask=answers([]))
    m.start(timeout=30)
    try:
        assert m.alive()
        assert any("isn't there any more" in line for line in lines)
    finally:
        m.stop()


def test_changed_host_key_is_refused(sshd):
    other = asyncssh.generate_private_key("ssh-ed25519").export_public_key().decode().split()
    ssh_async.KNOWN_HOSTS.parent.mkdir(parents=True)
    ssh_async.KNOWN_HOSTS.write_text(f"[127.0.0.1]:{sshd.port} {other[0]} {other[1]}\n")
    with pytest.raises(ssh.SshError, match="Host key verification failed"):
        login(sshd, answers([]))


class Forward:
    """What the phone's VPN gives SSH: a local port that leads to the cluster (here: to the fake sshd)."""

    def __init__(self, port: int):
        self.server = socket.create_server(("127.0.0.1", 0))
        self.port, self.to, self.used = self.server.getsockname()[1], port, 0
        threading.Thread(target=self._accept, daemon=True).start()

    def _accept(self):
        while True:
            try:
                client, _ = self.server.accept()
            except OSError:
                return
            self.used += 1
            upstream = socket.create_connection(("127.0.0.1", self.to))
            for a, b in ((client, upstream), (upstream, client)):
                threading.Thread(target=self._pipe, args=(a, b), daemon=True).start()

    @staticmethod
    def _pipe(a, b):
        try:
            while data := a.recv(65536):
                b.sendall(data)
        except OSError:
            pass
        finally:
            for s in (a, b):
                try:
                    s.shutdown(socket.SHUT_RDWR)
                except OSError:
                    pass

    def close(self):
        self.server.close()


def test_a_tunnel_port_keeps_the_cluster_name_for_the_host_key(sshd):
    from hpc_hub.core import tunnels
    fwd = Forward(sshd.port)
    tunnels.use("Cluster.Example", 22, fwd.port)  # a name that resolves nowhere: only the tunnel reaches it
    cfg = ClusterConfig(id="t", name="Test", host="cluster.example")
    try:
        m = ssh_async.AsyncSshMaster(cfg, "u", {}, print, answers([]))
        m.start(timeout=30)
        assert m.run("echo hi").stdout.strip() == "hi"
        m.stop()
        assert fwd.used == 1
        assert ssh_async.KNOWN_HOSTS.read_text().startswith("cluster.example ssh-ed25519 ")

        other = asyncssh.generate_private_key("ssh-ed25519").export_public_key().decode().split()
        ssh_async.KNOWN_HOSTS.write_text(f"cluster.example {other[0]} {other[1]}\n")
        with pytest.raises(ssh.SshError, match="Host key verification failed"):
            ssh_async.AsyncSshMaster(cfg, "u", {}, print, answers([])).start(timeout=30)
    finally:
        tunnels.drop("cluster.example", 22)
        fwd.close()
    assert tunnels.local_port("cluster.example", 22) is None


def test_cancel_while_waiting_for_duo(sshd):
    cfg = ClusterConfig(id="t", name="Test", host="127.0.0.1", port=sshd.port)
    asking, stop = threading.Event(), threading.Event()

    def ask(prompt):
        if "Password" in prompt:
            return fake_sshd.PASSWORD
        asking.set()
        stop.wait(10)
        return None

    m = ssh_async.AsyncSshMaster(cfg, "u", {}, print, ask)
    with pytest.raises(ssh.SshError, match="Cancelled"):
        m.start(timeout=30, cancelled=asking.is_set)
    stop.set()
    assert not m.alive()


def test_commands(master):
    quick = master.run("echo out; echo err >&2; exit 3")  # a shell kept open
    assert (quick.returncode, quick.stdout, quick.stderr) == (3, "out\n", "err\n")
    assert master._idle  # back in the pool
    slow = master.run("echo slow; exit 4", timeout=120)  # a channel of its own
    assert (slow.returncode, slow.stdout) == (4, "slow\n")
    for fast in (True, False):
        with pytest.raises(subprocess.TimeoutExpired):
            master.run("sleep 3", timeout=0.5, fast=fast)
    assert master.run("echo again").stdout == "again\n"


def test_commands_run_at_the_same_time(master):
    master.run("true")  # one shell open, so all three share it
    start = time.monotonic()
    with ThreadPoolExecutor(3) as pool:
        got = list(pool.map(lambda i: master.run(f"sleep 0.6; echo {i}").stdout, range(3)))
    assert got == ["0\n", "1\n", "2\n"] and time.monotonic() - start < 1.5
    assert len(master._open) == 1  # all in one shell


def test_big_outputs_at_once_stay_whole(master):
    with ThreadPoolExecutor(4) as pool:
        got = list(pool.map(lambda c: master.run(f"head -c 200000 /dev/zero | tr '\\0' {c}").stdout, "abcd"))
    assert got == [c * 200000 for c in "abcd"]


def test_a_timeout_stops_only_that_command(master, tmp_path):
    master.run("true")  # one shell open, so both share it
    mark = tmp_path / "ran"
    with ThreadPoolExecutor(2) as pool:
        slow = pool.submit(master.run, "sleep 1; echo slow", 10)
        with pytest.raises(subprocess.TimeoutExpired):
            master.run(f"sleep 1; touch {mark}", timeout=0.3, fast=True)
        assert slow.result(5).stdout == "slow\n"
    assert len(master._open) == 1 and master.run("echo again").stdout == "again\n"
    time.sleep(1)
    assert not mark.exists()


def test_argv_runs_on_the_connection(master):
    """Code that starts ssh.argv(...) itself gets the bridge: stdin, stdout, stderr and the exit code."""
    res = subprocess.run(master.argv("cat; echo bad >&2; exit 5"), input=b"data\x00\xff", capture_output=True,
                         timeout=30)
    assert (res.returncode, res.stdout, res.stderr) == (5, b"data\x00\xff", b"bad\n")
    proc = master.popen("echo Pending; sleep 0.2; echo Granted", stdout=subprocess.PIPE)
    assert [line.strip() for line in proc.stdout] == ["Pending", "Granted"]
    assert proc.wait(10) == 0


def test_bridge_needs_the_secret(master, monkeypatch):
    monkeypatch.setenv("HPC_HUB_SSH_BRIDGE", "not-it")
    res = subprocess.run(master.argv("echo hi"), capture_output=True, timeout=30)
    assert res.returncode == 255 and res.stdout == b""


def test_stopping_the_local_process_closes_the_channel(master, sshd):
    proc = subprocess.Popen(master.argv("echo started; sleep 30"), stdout=subprocess.PIPE)
    assert proc.stdout.readline() == b"started\n"
    proc.kill()
    proc.wait(10)
    assert master.run("echo fine").stdout == "fine\n"


def test_copies(master, sshd, tmp_path):
    local = tmp_path / "local"
    (local / "folder" / "sub").mkdir(parents=True)
    (local / "folder" / "sub" / "a.txt").write_text("hello")
    (sshd.root / "dest").mkdir()
    up = subprocess.run(master.copy_argv(str(local / "folder"), ":/dest/"), capture_output=True, text=True)
    assert up.returncode == 0, up.stderr
    assert (sshd.root / "dest" / "folder" / "sub" / "a.txt").read_text() == "hello"

    (tmp_path / "back").mkdir()
    down = subprocess.run(master.copy_argv(":/dest/folder", str(tmp_path / "back")), capture_output=True, text=True)
    assert down.returncode == 0, down.stderr
    assert (tmp_path / "back" / "folder" / "sub" / "a.txt").read_text() == "hello"

    missing = subprocess.run(master.copy_argv(":/nope", str(tmp_path)), capture_output=True, text=True)
    assert missing.returncode == 1 and missing.stderr.strip()


def test_forward(master):
    with socket.create_server(("127.0.0.1", 0)) as server:
        def echo():
            conn, _ = server.accept()
            with conn:
                conn.sendall(conn.recv(100).upper())
        threading.Thread(target=echo, daemon=True).start()
        port = master.forward("127.0.0.1", server.getsockname()[1])
        with socket.create_connection(("127.0.0.1", port), timeout=10) as c:
            c.sendall(b"ping")
            assert c.recv(100) == b"PING"


def test_terminal_channel(master):
    assert master.argv("tmux attach -t x", tty=True) == [ssh_async.CHANNEL, "t", "tmux attach -t x"]
    out, ended = bytearray(), threading.Event()
    codes = []
    ch = master.open_channel("tmux attach -t x", 100, 30, out.extend, lambda code: (codes.append(code), ended.set()))

    def wait_for(text: bytes):
        deadline = time.monotonic() + 10
        while text not in out and time.monotonic() < deadline:
            time.sleep(0.02)
        assert text in out, bytes(out)

    wait_for(b"pty xterm-256color 100x30 tmux attach -t x")
    ch.resize(120, 40)
    wait_for(b"size 120x40")
    ch.write("héllo\n")
    wait_for("echo héllo".encode())
    ch.write("exit\n")
    assert ended.wait(10) and codes == [3]


def test_lost_connection(master, sshd):
    sshd.stop()
    master._conn.abort()
    deadline = time.monotonic() + 5
    while master.alive() and time.monotonic() < deadline:
        time.sleep(0.05)
    assert not master.alive()
    assert master.run("true").returncode == 255
