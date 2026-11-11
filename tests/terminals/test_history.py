"""History windows, the map and marks, against a stand-in ssh and, where it's installed, a real tmux."""

import os
import shutil
import subprocess
import tempfile
import time
from pathlib import Path

import pytest

from hpc_hub.terminals import history, marks, tmux


class Ssh:
    """Runs what would run on the cluster, in bash here."""

    def __init__(self, home: Path):
        self.home, self.ran = home, []

    def _bash(self, command):
        self.ran.append(command)
        return subprocess.run(["bash", "-c", command], capture_output=True, text=True,
                              env={**os.environ, "HOME": str(self.home)})

    def run_on_host(self, node, command, timeout=15):
        return self._bash(command)

    def on_login(self, command, timeout=60, fast=None):
        return self._bash(command)

    run = on_login


@pytest.fixture
def ssh(tmp_path):
    return Ssh(tmp_path)


@pytest.fixture
def real():
    """A private tmux server on a short socket path. Yields a function that makes a session and runs a command in it."""
    if not shutil.which("tmux"):
        pytest.skip("tmux not installed")
    sock = Path(tempfile.mkdtemp(prefix="tt-", dir="/tmp"))
    old = os.environ.get("TMUX_TMPDIR")
    os.environ["TMUX_TMPDIR"] = str(sock)

    def start(name, command, cols=80, rows=24):
        line = tmux.new_session(name, command)
        subprocess.run(["bash", "-c", line], check=True)
        if cols != 80 or rows != 24:
            subprocess.run(["tmux", "resize-window", "-t", f"={name}:", "-x", str(cols), "-y", str(rows)], check=False)
        return name

    yield start
    subprocess.run(["tmux", "kill-server"], capture_output=True, env={**os.environ})
    if old is None:
        del os.environ["TMUX_TMPDIR"]
    else:
        os.environ["TMUX_TMPDIR"] = old
    shutil.rmtree(sock, ignore_errors=True)


def _show(name, fmt):
    return subprocess.run(["tmux", "display-message", "-p", "-t", f"={name}:", fmt], capture_output=True,
                          text=True).stdout.strip()


def _wait(check, what):
    for _ in range(200):
        if check():
            return
        time.sleep(0.03)
    raise AssertionError(f"timed out: {what}")


def test_new_session_is_valid_shell():
    line = tmux.new_session("hpchub-claude-1-x", "bash -lc 'cd ~; exec bash'", "/tmp")
    assert subprocess.run(["bash", "-n", "-c", line]).returncode == 0
    assert "history-limit" not in tmux.new_session("work", "bash")  # only sessions the app started


def test_create_keeps_tags_and_a_single_pane(real):
    real("hpchub-term-1", "sleep 30")
    subprocess.run(["bash", "-c", tmux.create("hpchub-term-2", "sleep 30", label="Run", color="#2ec27e", cwd="/tmp")],
                   check=True)
    # the placeholder is gone, the session is its one real pane, labelled, in its folder
    panes = subprocess.run(["tmux", "list-panes", "-t", "=hpchub-term-2:", "-F", "#{pane_current_command}"],
                           capture_output=True, text=True).stdout.split()
    assert panes == ["sleep"]
    assert _show("hpchub-term-2", "#{@hpchub_label}") == "Run"
    assert _show("hpchub-term-2", "#{pane_current_path}") == "/tmp"


def test_history_limit_only_on_app_sessions(real):
    real("hpchub-term-3", "seq 1 5; sleep 30")
    real("own", "seq 1 5; sleep 30")
    assert _show("hpchub-term-3", "#{history_limit}") == str(tmux.HISTORY_LIMIT)
    assert _show("own", "#{history_limit}") != str(tmux.HISTORY_LIMIT)
    # the server-wide default is untouched
    assert subprocess.run(["tmux", "show-options", "-g", "history-limit"], capture_output=True,
                          text=True).stdout.split()[1] == "2000"


def test_second_create_leaves_the_session_alone(real):
    real("hpchub-term-4", "sleep 30")
    pane = _show("hpchub-term-4", "#{pane_id}")
    subprocess.run(["bash", "-c", tmux.create("hpchub-term-4", "sleep 30")], check=True)
    assert _show("hpchub-term-4", "#{pane_id}") == pane


def test_window_reads_history_lines(real, ssh):
    real("hpchub-term-5", "seq 1 500; sleep 30")
    name = "hpchub-term-5"
    _wait(lambda: "500" in history.window(ssh, name, "", None, 30)["rows"][-2:] or
          any("500" == r for r in history.window(ssh, name, "", None, 30)["rows"]), "the output")
    last = history.window(ssh, name, "", None, 30)
    assert last["limit"] == tmux.HISTORY_LIMIT and last["total"] == last["history"] + last["height"]
    assert last["start"] == last["total"] - 30
    top = history.window(ssh, name, "", 0, 10)
    assert top["start"] == 0 and top["rows"][:3] == ["1", "2", "3"]
    # repeated reads give the same lines and change nothing
    assert history.window(ssh, name, "", 0, 10)["rows"] == top["rows"]
    assert _show(name, "#{pane_in_mode}") == "0"
    # a start past the end is pulled back
    far = history.window(ssh, name, "", 10_000, 5)
    assert far["start"] == far["total"] - 1
    assert history.window(ssh, name, "", None, history.WINDOW_MAX + 900)["rows"]  # asked too many: capped, no error


def test_window_says_when_the_session_is_gone(real, ssh):
    real("hpchub-term-6", "sleep 30")
    assert not history.window(ssh, "hpchub-term-6", "", None, 10).get("gone")
    assert history.window(ssh, "hpchub-term-nope", "", None, 10) == {"gone": True}
    assert history.outline(ssh, "hpchub-term-nope", "", 50) == {"gone": True}


def test_outline_maps_kinds_and_prompts(real, ssh, tmp_path):
    script = tmp_path / "s.sh"
    script.write_text("for i in $(seq 1 60); do echo row $i; done\n"
                      "printf '%s\\n' '> how fast is it' '│ a │ b │' '┌──┐' 'jdoe@login1:~$ ls'\n"
                      "for i in $(seq 1 60); do echo tail $i; done\nsleep 30\n")
    real("hpchub-term-7", f"bash {script}", cols=120)
    name = "hpchub-term-7"
    _wait(lambda: any("tail 60" == r for r in history.window(ssh, name, "", None, 30)["rows"]), "the output")
    got = history.outline(ssh, name, "", 200)
    assert len(got["map"]) == 200 and all(len(b) == 2 for b in got["map"])
    # the prompt echo and the shell prompt land in the prompt list at their real lines
    rows = history.window(ssh, name, "", 0, 200)["rows"]
    assert got["prompts"] == [i for i, r in enumerate(rows) if r.startswith("> ") or r.startswith("jdoe@")]
    assert max(b[0] for b in got["map"]) == 3


def test_marks_round_trip_and_find_their_place(real, ssh):
    script = "for i in $(seq 1 120); do echo epoch $i loss 0.$i; done; sleep 30"
    real("hpchub-term-8", f"bash -c '{script}'")
    name = "hpchub-term-8"
    _wait(lambda: any(r == "epoch 120 loss 0.120" for r in history.window(ssh, name, "", None, 40)["rows"]),
          "the output")
    rows = history.window(ssh, name, "", 0, 130)["rows"]
    at = rows.index("epoch 40 loss 0.40")
    m = marks.add(ssh, name, "Good run", at, 2, "\n".join(rows[at:at + 2]))
    assert marks.load(ssh, name)[0]["name"] == "Good run"
    got = marks.resolve(ssh, name, "", marks.load(ssh, name))
    assert not got["ended"] and got["marks"][0]["live"] and got["marks"][0]["line"] == at
    marks.rename(ssh, name, m["id"], "Better name")
    assert marks.load(ssh, name)[0]["name"] == "Better name"
    marks.remove(ssh, name, m["id"])
    assert marks.load(ssh, name) == []


def test_mark_survives_its_text_being_trimmed(real, ssh):
    real("hpchub-term-9", "sleep 60")
    name = "hpchub-term-9"
    m = marks.add(ssh, name, "A table", 7, 2, "┌ loss table ┐\n│ 0.21 best │")
    got = marks.resolve(ssh, name, "", marks.load(ssh, name))
    assert not got["marks"][0]["live"] and not got["ended"]
    assert got["marks"][0]["text"].startswith("┌ loss table") and got["marks"][0]["line"] == 7
    subprocess.run(["tmux", "kill-session", "-t", f"={name}"], check=True)
    ended = marks.resolve(ssh, name, "", marks.load(ssh, name))
    assert ended["ended"] and not ended["marks"][0]["live"]
    assert marks.load(ssh, name)[0]["id"] == m["id"]


def test_mark_file_name_stays_inside_the_folder(ssh):
    marks.add(ssh, "../evil name", "x", 1, 1, "hello row")
    assert (ssh.home / ".hpc-hub/marks/.._evil_name.json").exists()


def test_a_reconnected_read_is_safe_to_repeat(real, ssh):
    real("hpchub-term-10", "seq 1 40; sleep 30")
    name = "hpchub-term-10"
    _wait(lambda: any(r == "40" for r in history.window(ssh, name, "", None, 45)["rows"]), "the output")
    before = _show(name, "#{history_size} #{pane_in_mode}")
    for _ in range(3):
        history.outline(ssh, name, "", 60)
        history.window(ssh, name, "", 0, 20)
        marks.resolve(ssh, name, "", [])
    assert _show(name, "#{history_size} #{pane_in_mode}") == before
