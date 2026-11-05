import subprocess
import threading
import time
from concurrent.futures import ThreadPoolExecutor

from hpc_hub.core import config, ssh


def test_a_refused_session_is_tried_again(monkeypatch):
    m = ssh.SshMaster(config.default_clusters()[0], "jdoe", {}, lambda _: None)
    answers = [subprocess.CompletedProcess([], 255, "", f"mux_client_request_session: {ssh.REFUSED}\n"),
               subprocess.CompletedProcess([], 0, "claude\n", "")]
    monkeypatch.setattr(ssh.subprocess, "run", lambda *a, **k: answers.pop(0))
    monkeypatch.setattr(ssh.time, "sleep", lambda _: None)
    assert m._run_plain("type -t claude", 30).stdout == "claude\n" and not answers


def test_other_errors_are_not_tried_again(monkeypatch):
    m = ssh.SshMaster(config.default_clusters()[0], "jdoe", {}, lambda _: None)
    calls = []
    monkeypatch.setattr(ssh.subprocess, "run",
                        lambda *a, **k: calls.append(1) or subprocess.CompletedProcess([], 1, "", "no such file"))
    assert m._run_plain("ls /nope", 30).returncode == 1 and len(calls) == 1


def test_a_burst_waits_its_turn_instead_of_opening_too_many_sessions(monkeypatch):
    m = ssh.SshMaster(config.default_clusters()[0], "jdoe", {}, lambda _: None)
    lock, now, most = threading.Lock(), [0], [0]

    def run(*a, **k):
        with lock:
            now[0] += 1
            most[0] = max(most[0], now[0])
        time.sleep(0.02)
        with lock:
            now[0] -= 1
        return subprocess.CompletedProcess([], 0, "", "")
    monkeypatch.setattr(ssh.subprocess, "run", run)
    with ThreadPoolExecutor(12) as pool:
        list(pool.map(lambda i: m._run_plain("git log", 30), range(12)))
    assert most[0] == ssh.PLAIN_SESSIONS
