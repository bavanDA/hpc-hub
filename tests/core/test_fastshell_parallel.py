import subprocess
import threading
import time
from concurrent.futures import ThreadPoolExecutor

import pytest

from hpc_hub.core.fastshell import SLOTS, FastShell, FastShellError


@pytest.fixture
def shell():
    sh = FastShell(["bash", "-c"])
    yield sh
    sh.close()


def test_a_command_gives_output_errors_and_code(shell):
    got = shell.run("echo out; echo err >&2; exit 3", 10)
    assert (got.returncode, got.stdout, got.stderr) == (3, "out\n", "err\n")


def test_commands_really_run_at_the_same_time(shell):
    start = time.monotonic()
    with ThreadPoolExecutor(3) as pool:
        got = list(pool.map(lambda i: shell.run(f"sleep 0.6; echo {i}", 10).stdout, range(3)))
    assert got == ["0\n", "1\n", "2\n"] and time.monotonic() - start < 1.5


def test_big_outputs_at_once_stay_whole(shell):
    with ThreadPoolExecutor(SLOTS) as pool:
        got = list(pool.map(lambda c: shell.run(f"head -c 300000 /dev/zero | tr '\\0' {c}", 20).stdout, "abcdefgh"))
    assert got == [c * 300000 for c in "abcdefgh"]


def test_only_so_many_run_at_once(shell):
    start = time.monotonic()
    with ThreadPoolExecutor(SLOTS + 1) as pool:
        list(pool.map(lambda i: shell.run("sleep 0.5", 10), range(SLOTS + 1)))
    assert time.monotonic() - start >= 0.95


def test_a_shell_can_be_given_more_room():
    wide = FastShell(["bash", "-c"], slots=16)
    start = time.monotonic()
    with ThreadPoolExecutor(16) as pool:
        got = list(pool.map(lambda i: wide.run(f"sleep 0.5; echo {i}", 10).stdout, range(16)))
    wide.close()
    assert got == [f"{i}\n" for i in range(16)] and time.monotonic() - start < 1.4


def test_a_slow_command_does_not_hold_up_the_others(shell):
    slow = threading.Thread(target=lambda: shell.run("sleep 3", 10), daemon=True)
    slow.start()
    time.sleep(0.1)
    start = time.monotonic()
    assert shell.run("echo quick", 5).stdout == "quick\n" and time.monotonic() - start < 1


def test_a_timeout_stops_only_that_command(shell, tmp_path):
    mark = tmp_path / "ran"
    with pytest.raises(subprocess.TimeoutExpired):
        shell.run(f"sleep 1; touch {mark}", 0.2)
    assert shell.alive and shell.run("echo still here", 5).stdout == "still here\n"
    time.sleep(1.2)
    assert not mark.exists()


def test_the_lock_is_free_after_a_timeout(shell):
    with pytest.raises(subprocess.TimeoutExpired):
        shell.run("sleep 5", 0.2)
    time.sleep(0.3)
    with ThreadPoolExecutor(3) as pool:
        assert list(pool.map(lambda i: shell.run(f"echo {i}", 5).stdout, range(3))) == ["0\n", "1\n", "2\n"]


def test_when_the_shell_dies_waiting_commands_are_told(shell):
    with ThreadPoolExecutor(2) as pool:
        waiting = pool.submit(shell.run, "sleep 5", 10)
        time.sleep(0.2)
        shell.close()
        with pytest.raises(FastShellError) as e:
            waiting.result(5)
    assert e.value.sent and not shell.alive


def test_a_closed_shell_says_nothing_was_sent(shell):
    shell.close()
    time.sleep(0.1)
    with pytest.raises(FastShellError) as e:
        shell.run("echo x", 2)
    assert not e.value.sent
