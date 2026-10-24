"""The asyncssh login (Windows' SSH) against an SSH server in this process (tests/fake_sshd.py)."""

import socket
import subprocess
import threading
import time

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


def test_changed_host_key_is_refused(sshd):
    other = asyncssh.generate_private_key("ssh-ed25519").export_public_key().decode().split()
    ssh_async.KNOWN_HOSTS.parent.mkdir(parents=True)
    ssh_async.KNOWN_HOSTS.write_text(f"[127.0.0.1]:{sshd.port} {other[0]} {other[1]}\n")
    with pytest.raises(ssh.SshError, match="Host key verification failed"):
        login(sshd, answers([]))


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
