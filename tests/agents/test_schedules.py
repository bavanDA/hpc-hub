import datetime
import subprocess

from hpc_hub.agents import schedules
from hpc_hub.agents.schedules import Schedule
from hpc_hub.core.config import AgentSettings, ComputeProfile


def test_script_is_valid_bash():
    s = Schedule("clean-thesis", "claude", "~/thesis", "tidy up", "02:00", [1, 2, 3, 4, 5], 180)
    text = schedules.script(s, schedules.BY_ID["claude"], AgentSettings(command="claude"),
                            ComputeProfile(cpus=4, mem_gb=16, account="mygroup"))
    assert "#SBATCH --job-name=hpc-hub-sched-clean-thesis" in text and "#SBATCH --time=03:00:00" in text
    assert "--permission-mode acceptEdits" in text and "dangerous" not in text and '"$DIR/task.md"' in text
    assert subprocess.run(["bash", "-n"], input=text, text=True).returncode == 0
    cmd = schedules.save_command(s, AgentSettings(command="claude"), ComputeProfile())
    assert subprocess.run(["bash", "-n", "-c", cmd]).returncode == 0
    assert "--begin=" in cmd and "touch" in cmd


def test_next_run_picks_the_next_matching_day():
    def run(days, time):
        out = subprocess.run(["bash", "-c", f"DAYS='{days}'; TIME='{time}'; {schedules.NEXT_RUN}; next_run; "
                              "date +%F; date +%u"], capture_output=True, text=True).stdout.split()
        return out
    soon = datetime.datetime.now() + datetime.timedelta(minutes=5)
    nxt, today, dow = run("1 2 3 4 5 6 7", soon.strftime("%H:%M"))
    if soon.date().isoformat() == today:  # not in the last minutes before midnight
        assert nxt == f"{today}T{soon:%H:%M}:00"  # later today
    nxt, today, dow = run("1 2 3 4 5 6 7", "00:00")
    assert nxt.endswith("T00:00:00") and nxt[:10] > today  # tomorrow
    other = str(int(dow) % 7 + 1)  # tomorrow's weekday only
    nxt, today, _ = run(other, "00:00")
    assert nxt[:10] > today


def test_parse_list():
    text = ('@@SCHED\n{"name": "clean", "agent": "claude", "folder": "~/thesis", "task": "t", "time": "02:00", '
            '"days": [], "hours": 2, "enabled": true}\n@@LAST 1792500000 /h/.hpc-hub/schedules/clean/logs/x.md\n'
            "@@SCHED\nnot json\n@@JOBS\nhpc-hub-sched-clean|55|PENDING|2026-10-20T02:00:00\n")
    [st] = schedules.parse_list(text)
    assert st.schedule.when == "Every day at 02:00" and (st.job_id, st.state) == ("55", "PENDING")
    assert st.schedule.minutes == 120  # old "hours" still read
    assert st.last_run == 1792500000 and st.last_log.endswith("x.md")
    assert Schedule("a", days=[1, 2, 3, 4, 5]).when == "Weekdays at 02:00"
    assert Schedule("a", days=[6, 7], time="09:30").when == "Sat, Sun at 09:30"
    assert schedules.slug(" clean the thesis code! ") == "clean-the-thesis-code"


def test_presets_name_their_branch():
    for label, (role, text) in schedules.PRESETS.items():
        assert "{" not in text
        if text:
            assert f"agent/{role}-" in text


def test_odd_names_stay_harmless():
    st = schedules.parse_list('@@SCHED\n{"name": "x; touch /tmp/pwned #", "agent": "claude", "folder": "~"}\n')
    assert st[0].schedule.name == "x-touch-tmp-pwned"
    assert "; touch" not in schedules.delete_command(st[0].schedule)
