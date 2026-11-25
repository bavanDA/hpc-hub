"""Continue on an ended ChatGPT tab (2026-11-25, the owner: "where is the continue button"): the Codex chat the tab
had is found from its tmux name, its title and its job's times in sacct, also after the job ended. The script runs
here on a made-up home with a made-up sacct."""

import calendar
import json
import os
import subprocess
import sys
from datetime import timezone

import pytest

from hpc_hub.agents import catalog, codex_where
from hpc_hub.agents.codex_where import Rollout
from hpc_hub.core.cluster_settings import AgentSettings

pytestmark = pytest.mark.skipif(sys.platform == "win32", reason="the script runs in a POSIX home")
UTC = timezone.utc
SESSION = "hpchub-codex-1659999-143015"  # a new chat, started at 14:30:15 by this computer's clock
TITLE = "ChatGPT · thesis"


def at(stamp: str) -> int:
    return calendar.timegm((int(stamp[:4]), int(stamp[5:7]), int(stamp[8:10]), int(stamp[11:13]),
                            int(stamp[14:16]), int(stamp[17:19]), 0, 0, 0))


class Here:
    """ssh.run on this machine: HOME is the made-up home, its bin/ (the made-up sacct) first on PATH, in UTC."""
    def __init__(self, home):
        self.home = home

    def run(self, cmd, timeout=60):
        env = {**os.environ, "HOME": str(self.home), "TZ": "UTC",
               "PATH": f"{self.home / 'bin'}{os.pathsep}{os.environ.get('PATH', '')}"}
        return subprocess.run(["bash", "-c", cmd], capture_output=True, text=True, timeout=timeout, env=env)


def sacct(home, start: str, end: str = "Unknown"):
    """A sacct that knows one job, in epoch seconds only when asked with SLURM_TIME_FORMAT=%s."""
    b = home / "bin"
    b.mkdir(exist_ok=True)
    s = b / "sacct"
    epoch = f"{at(start)}|{at(end) if end != 'Unknown' else 'Unknown'}"
    s.write_text("#!/bin/sh\n"
                 f'echo "$@" >> "{home}/sacct.args"\n'
                 f'[ "$SLURM_TIME_FORMAT" = "%s" ] || {{ echo "{start}|{end}"; exit 0; }}\n'
                 f'echo "{epoch}"\n')
    s.chmod(0o755)


def rollout(home, chat_id: str, started: str, cwd: str, written: str = "", meta: bool = True):
    """Codex's file for a chat it started at started (UTC), last written at written."""
    d = home / ".codex" / "sessions" / started[:4] / started[5:7] / started[8:10]
    d.mkdir(parents=True, exist_ok=True)
    f = d / f"rollout-{started[:10]}T{started[11:19].replace(':', '-')}-{chat_id}.jsonl"
    payload = {"id": chat_id, "cwd": cwd, "timestamp": started[:19] + ".123Z"} if meta else {"cwd": cwd}
    f.write_text(json.dumps({"type": "session_meta", "payload": payload}) + "\n"
                 + json.dumps({"type": "event_msg", "payload": {"type": "user_message", "message": "hi"}}) + "\n")
    w = at(written or started) + 30
    os.utime(f, (w, w))
    return f


def where(home, session=SESSION, title=TITLE):
    return codex_where.where(Here(home), session, title, tz=UTC)


A = "01a2b3c4-0000-7000-8000-00000000000a"
B = "01a2b3c4-1111-7000-8000-00000000000b"
C = "01a2c000-2222-7000-8000-00000000000c"
D = "01a2d000-3333-7000-8000-00000000000d"


def test_a_new_chat_is_the_one_codex_started_after_the_tab_in_its_folder(tmp_path):
    sacct(tmp_path, "2026-11-24T14:00:00", "2026-11-24T16:00:00")
    rollout(tmp_path, A, "2026-11-24T14:10:00", "/home/jdoe/thesis")  # before the tab: another tab's
    rollout(tmp_path, B, "2026-11-24T14:30:20", "/home/jdoe/other")  # sooner, but another folder
    rollout(tmp_path, C, "2026-11-24T14:30:40", "/home/jdoe/thesis", "2026-11-24T15:40:00")
    rollout(tmp_path, D, "2026-11-24T15:00:00", "/home/jdoe/thesis")  # a later tab's, in the same folder
    assert where(tmp_path) == {"chat_id": C, "folder": "/home/jdoe/thesis"}
    assert "-j 1659999" in (tmp_path / "sacct.args").read_text()


def test_the_tab_may_start_on_a_later_day_of_a_long_job(tmp_path):
    sacct(tmp_path, "2026-11-23T20:00:00", "2026-11-25T08:00:00")
    rollout(tmp_path, A, "2026-11-23T14:30:30", "/home/jdoe/thesis")  # that time the day before the job
    rollout(tmp_path, C, "2026-11-24T14:30:30", "/home/jdoe/thesis")
    assert where(tmp_path)["chat_id"] == C


def test_a_job_that_still_runs_ends_now(tmp_path):
    sacct(tmp_path, "2026-11-24T14:00:00")  # End: Unknown
    rollout(tmp_path, C, "2026-11-24T14:30:25", "/home/jdoe/thesis")
    assert where(tmp_path)["chat_id"] == C


def test_without_a_folder_to_compare_the_chat_started_with_the_tab_wins(tmp_path):
    sacct(tmp_path, "2026-11-24T14:00:00", "2026-11-24T16:00:00")
    rollout(tmp_path, B, "2026-11-24T14:31:10", "/home/jdoe")
    rollout(tmp_path, D, "2026-11-24T15:00:00", "/home/jdoe/thesis")  # half an hour on: not this tab's start
    assert where(tmp_path, title="ChatGPT · ~")["chat_id"] == B


def test_no_saved_chat_says_so(tmp_path):
    """Codex writes its file once you send a message: a tab closed before that has nothing to continue."""
    sacct(tmp_path, "2026-11-24T14:00:00", "2026-11-24T16:00:00")
    rollout(tmp_path, A, "2026-11-24T14:10:00", "/home/jdoe/thesis")  # before the tab
    rollout(tmp_path, D, "2026-11-24T15:20:00", "/home/jdoe/thesis")  # a later tab's, in the same folder
    rollout(tmp_path, B, "2026-11-24T16:30:00", "/home/jdoe/thesis")  # after the job
    with pytest.raises(RuntimeError, match="Codex saved no chat for this tab: it may have ended before you sent"):
        where(tmp_path)
    (tmp_path / ".codex").rename(tmp_path / "gone")
    with pytest.raises(RuntimeError, match="Codex saved no chat"):
        where(tmp_path)


def test_a_chat_without_its_start_in_the_file_goes_by_the_file_name(tmp_path):
    sacct(tmp_path, "2026-11-24T14:00:00", "2026-11-24T16:00:00")
    rollout(tmp_path, C, "2026-11-24T14:30:40", "/home/jdoe/thesis", meta=False)
    assert where(tmp_path) == {"chat_id": C, "folder": "/home/jdoe/thesis"}


def test_a_resumed_chat_is_found_by_its_id_start_and_the_job_it_was_written_in(tmp_path):
    """Codex's ids begin with the time, so chats started within a minute share their first 8 characters."""
    sacct(tmp_path, "2026-11-24T14:00:00", "2026-11-24T16:00:00")
    rollout(tmp_path, A, "2026-10-19T17:27:01", "/home/jdoe/thesis", "2026-11-24T15:10:00")  # resumed in the job
    rollout(tmp_path, B, "2026-10-19T17:27:18", "/home/jdoe/thesis")  # same start, untouched since
    rollout(tmp_path, C, "2026-11-24T14:30:20", "/home/jdoe/thesis")  # another id
    assert where(tmp_path, "hpchub-codex-1659999-01a2b3c4") == {"chat_id": A, "folder": "/home/jdoe/thesis"}


def test_without_sacct_a_resumed_chat_is_still_found(tmp_path):
    rollout(tmp_path, A, "2026-10-19T17:27:01", "/home/jdoe/thesis")
    assert where(tmp_path, "hpchub-codex-1659999-01a2b3c4")["chat_id"] == A
    assert where(tmp_path, "hpchub-codex-01a2b3c4")["chat_id"] == A  # a tab that names no job


def test_without_a_job_the_days_before_now_count():
    now = at("2026-11-24T18:00:00")
    chats = [Rollout(A, at("2026-11-24T14:30:30"), now, "/home/jdoe/thesis")]
    assert codex_where.pick("143015", chats, now - 3 * 86400, now, "thesis", UTC) == chats[0]
    assert codex_where.pick("235959", chats, now - 3 * 86400, now, "thesis", UTC) is None


def test_the_tab_start_is_read_on_this_computers_clock():
    """agent_start took HHMMSS from this computer's clock: 14:30:15 in UTC-5 is 19:30:15 UTC."""
    from datetime import timedelta
    est = timezone(timedelta(hours=-5))
    assert codex_where.moments("143015", at("2026-11-24T14:00:00"), at("2026-11-24T23:00:00"), est) == \
        [at("2026-11-24T19:30:15")]
    assert codex_where.moments("991500", 0, 10**9, UTC) == []


def test_only_chatgpt_tabs_hpc_hub_started_are_looked_up(tmp_path):
    assert codex_where.parse_tab(SESSION) == ("1659999", "143015")
    assert codex_where.parse_tab("hpchub-codex-143015") == ("", "143015")
    assert codex_where.parse_tab("hpchub-codex-1659999-01a2b3c4") == ("1659999", "01a2b3c4")
    for session in ("hpchub-claude-1659999-3f2a9c1e", "hpchub-term-1122-101010", "hpchub-codex-1659999-1430",
                    "hpchub-codex-1659999-143015; rm -rf ~", "work"):
        with pytest.raises(ValueError):
            codex_where.where(Here(tmp_path), session, TITLE)


def test_the_title_names_the_folder():
    assert codex_where.folder_of("ChatGPT · thesis") == "thesis"
    assert codex_where.folder_of("ChatGPT·thesis") == "thesis"
    assert codex_where.folder_of("ChatGPT · ~") == ""
    assert codex_where.folder_of("") == ""


def test_continuing_resumes_that_chat_without_the_background_server():
    line = catalog.command(catalog.CODEX, AgentSettings(command="codex"), C)
    assert f"codex resume --no-daemon {C}" in line
