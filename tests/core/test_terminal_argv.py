"""The window starts only a terminal argv the backend made (app/src-tauri/src/pty.rs): each one is told to it as a
"pty-argv" event on the backend's own output, before the answer that carries it."""

import io
import json
from pathlib import Path

import pytest

from hpc_hub.api import hub as hub_module
from hpc_hub.api.hub import Hub
from hpc_hub.api.server import Server
from hpc_hub.core import config, ssh

ROOT = Path(__file__).resolve().parents[2]


@pytest.fixture(autouse=True)
def _no_real_config(monkeypatch):
    """A Hub here never reads the config of whoever runs the tests."""
    monkeypatch.setattr(hub_module.config, "load", lambda: [])
    monkeypatch.setattr(hub_module.config, "load_app", lambda: {})
    monkeypatch.setattr(hub_module.config, "chosen", lambda clusters, app: [])


def master():
    return ssh.SshMaster(config.default_clusters()[0], "jdoe", {}, lambda _: None)


def test_every_terminal_argv_is_told(monkeypatch):
    told = []
    monkeypatch.setattr(ssh, "ON_TERMINAL", [told.append])
    argv = master().argv("tmux attach -t x", tty=True)
    assert told == [argv] and argv[0] == "ssh" and argv[-1].endswith("tmux attach -t x")


def test_plain_commands_are_not_told(monkeypatch):
    """Only terminals go to pty_open: commands HPC Hub runs itself never need the window's leave."""
    told = []
    monkeypatch.setattr(ssh, "ON_TERMINAL", [told.append])
    master().argv("squeue --me")
    master().argv()
    assert told == []


def test_the_hub_sends_it_as_a_pty_argv_event(monkeypatch):
    monkeypatch.setattr(ssh, "ON_TERMINAL", [])
    out = io.StringIO()
    server = Server(out=out, workers=1)
    Hub(server.emit)
    argv = master().argv("tmux attach -t x", tty=True)
    line = json.loads(out.getvalue().splitlines()[-1])
    # the exact shape pty.rs made_argv reads
    assert line == {"jsonrpc": "2.0", "method": "event", "params": {"name": "pty-argv", "data": {"argv": argv}}}
    assert '"pty-argv"' in out.getvalue()


def test_a_newer_hub_replaces_the_older_ones_listener(monkeypatch):
    monkeypatch.setattr(ssh, "ON_TERMINAL", [])
    first, second = [], []
    Hub(lambda name, data=None: first.append(name))
    Hub(lambda name, data=None: second.append(name))
    master().argv("x", tty=True)
    assert first == [] and second == ["pty-argv"]


def test_the_frozen_backend_writes_no_pycache_beside_a_quick_fix():
    text = (ROOT / "packaging" / "backend.py").read_text()
    fix = text[text.index("if FIX and"):]
    assert fix.index("sys.dont_write_bytecode = True") < fix.index("sys.path.insert(0, FIX)")
