from hpc_hub.compute import vscode_job

BANNER = """*
* Visual Studio Code Server
*
"""
LOGIN = BANNER + ("To grant access to the server, please log into https://github.com/login/device "
                  "and use code AB12-CD34\n")
READY = BANNER + """  Visual Studio Code Tunnel v1.123.0

  \x1b[1m➜\x1b[0m  Tunnel:   n0042
  ➜  Open:  https://vscode.dev/tunnel/n0042/home/jdoe

[2026-11-11 21:18:51] info No agent host supervisor running; starting one in the background
"""
INSTALLING = READY + "[2026-11-11 21:20:24] info [rpc.0] Downloading Visual Studio Code server -> /tmp/x.tar.gz\n"
STARTED = INSTALLING + "[2026-11-11 21:20:46] info [rpc.0] Server started\n"


def out(state="", done="", log=""):
    return f"@@state {state}\n@@done {done}\n@@log\n{log}"


def test_waiting_in_the_queue():
    got = vscode_job.status("42", out("PENDING||Priority|2026-11-12T15:00:00"))
    assert got["phase"] == "queued" and got["reason"] == "Priority" and got["start"] == "2026-11-12T15:00:00"
    assert vscode_job.status("42", out("PENDING||None|N/A"))["start"] == ""


def test_starting_then_github_sign_in():
    assert vscode_job.status("42", out("RUNNING|n0111|None|2026-11-12T15:00:00", log=BANNER))["phase"] == "starting"
    got = vscode_job.status("42", out("RUNNING|n0111|None|x", log=LOGIN))
    assert got["phase"] == "login" and got["node"] == "n0111"
    assert got["device"] == {"url": "https://github.com/login/device", "code": "AB12-CD34"}


def test_ready_then_installing_then_running():
    got = vscode_job.status("42", out("RUNNING|n0111|None|x", log=LOGIN + READY))
    assert got["phase"] == "ready" and got["tunnel"] == "n0042" and got["device"] is None  # signed in by now
    assert got["home"] == "/home/jdoe" and not got["installing"]
    assert vscode_job.status("42", out("RUNNING|n0111|None|x", log=INSTALLING))["installing"]
    got = vscode_job.status("42", out("RUNNING|n0111|None|x", log=STARTED))
    assert not got["installing"] and got["server"]


def test_an_ended_job_says_why_with_its_last_lines():
    log = BANNER + "slurm_script: line 4: /home/jdoe/vscode_cli/code: No such file or directory\n"
    got = vscode_job.status("42", out(done="FAILED|127:0", log=log))
    assert got["phase"] == "ended" and got["state"] == "FAILED"
    assert "No such file or directory" in got["problem"] and got["tail"][-1].endswith("No such file or directory")
    timeout = vscode_job.status("42", out(done="TIMEOUT|0:0", log=STARTED))
    assert timeout["phase"] == "ended" and "time ran out" in timeout["problem"]


def test_a_running_job_stuck_on_an_error_says_so():
    log = BANNER + "bash: code: command not found\n"
    got = vscode_job.status("42", out("RUNNING|n0111|None|x", log=log))
    assert got["phase"] == "starting" and "command not found" in got["problem"]


def test_the_command_reads_the_job_and_its_log():
    cmd = vscode_job.status_command("42")
    assert "squeue -h -j 42" in cmd and "sacct" in cmd and "hpc-hub-vscode-42.out" in cmd


def test_a_job_that_can_never_start_says_so():
    why = "Job's QOS not permitted to use this partition (debug allows debug not low)"
    got = vscode_job.status("42", out(f"PENDING||{why}|N/A"))
    assert got["phase"] == "queued" and got["stuck"]
    assert got["problem"].startswith("This job can't start with this queue and priority. Slurm says: Job's QOS")
    for code in ("InvalidAccount", "QOSMaxWallDurationPerJobLimit", "PartitionTimeLimit", "QOSNotAllowed"):
        assert vscode_job.status("42", out(f"PENDING||{code}|N/A"))["stuck"], code
    for code in ("Priority", "Resources", "QOSMaxCpuPerUserLimit", "AssocGrpCPULimit"):  # these clear by themselves
        assert not vscode_job.status("42", out(f"PENDING||{code}|N/A"))["stuck"], code
