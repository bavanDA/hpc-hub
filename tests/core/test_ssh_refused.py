import subprocess

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
