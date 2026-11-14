"""The Desktop's job script, run here with stand-ins for TurboVNC, and reading its state."""

import os
import stat
import subprocess

import pytest

from hpc_hub.compute import desktop_job
from tests.helpers import on_linux_cluster

FAKE_VNCSERVER = """#!/bin/sh
echo "args: $*" > "$HOME/vnc-args"
echo ""
echo "Desktop 'TurboVNC: n0042:3 (jdoe)' started on display n0042:3"
echo "Starting applications specified in $HOME/x"
"""


@pytest.fixture
def node(tmp_path):
    home, bin_ = tmp_path / "home", tmp_path / "bin"
    home.mkdir()
    bin_.mkdir()
    for name, text in (("vncserver", FAKE_VNCSERVER), ("vncpasswd", "#!/bin/sh\ncat > /dev/null\nprintf binary\n")):
        (bin_ / name).write_text(text)
        (bin_ / name).chmod(0o755)
    return home, bin_


@on_linux_cluster
def test_the_job_starts_a_private_desktop(node):
    home, bin_ = node
    run = subprocess.run(["bash", "-c", desktop_job.body(1920, 1080)], capture_output=True, text=True, timeout=30,
                         env={"HOME": str(home), "PATH": f"{bin_}:/usr/bin:/bin", "SLURM_JOB_ID": "777"})
    d = home / ".hpc-hub/desktop/777"
    assert "@@ready" in run.stdout, run.stdout + run.stderr
    assert (d / "display").read_text() == "3"
    pw = (d / "password").read_text().strip()
    assert len(pw) == 8 and pw.isalnum() and pw not in run.stdout, "the password never goes to the job's log"
    assert stat.S_IMODE(os.stat(d).st_mode) == 0o700 and stat.S_IMODE(os.stat(d / "password").st_mode) == 0o600
    args = (home / "vnc-args").read_text()
    assert "-fg" in args and "-geometry 1920x1080" in args and "-securitytypes VNC" in args
    assert f"-rfbauth {d}/passwd" in args and "startxfce4" in (d / "xstartup").read_text()


@on_linux_cluster
def test_no_vnc_server_says_so(tmp_path):
    run = subprocess.run(["bash", "-c", desktop_job.body()], capture_output=True, text=True, timeout=30,
                         env={"HOME": str(tmp_path), "PATH": "/usr/bin:/bin", "SLURM_JOB_ID": "1"})
    if os.path.exists("/opt/TurboVNC/bin/vncserver"):
        pytest.skip("this machine has TurboVNC")
    assert run.returncode == 1 and "@@error This cluster's compute nodes have no VNC server" in run.stdout


@pytest.mark.parametrize("out,phase,port", [
    ("@@state PENDING|(Priority)|Priority\n@@done \n@@display \n@@error \n@@end\n", "queued", 0),
    ("@@state RUNNING|n0042|None\n@@done \n@@display \n@@error \n@@end\n", "starting", 0),
    ("@@state RUNNING|n0042|None\n@@done \n@@display 3\n@@error \n@@end\n", "ready", 5903),
    ("@@state \n@@done TIMEOUT\n@@display 3\n@@error \n@@end\n", "ended", 0),
])
def test_states(out, phase, port):
    got = desktop_job.status("777", out)
    assert got["phase"] == phase and got["port"] == port
    if phase == "ready":
        assert got["node"] == "n0042"
    if phase == "queued":
        assert got["node"] == "" and got["reason"] == "Priority"


def test_an_ended_desktop_says_why():
    got = desktop_job.status("1", "@@state \n@@done \n@@display \n@@error This cluster's compute nodes have no VNC "
                                  "server (TurboVNC or TigerVNC).\n@@end\n")
    assert got["phase"] == "ended" and "no VNC server" in got["problem"]
    with pytest.raises(RuntimeError):
        desktop_job.status("1", "@@state RUNNING|n0042|None\n")  # cut off


def test_the_screen_size_stays_sane():
    assert "-geometry 640x480" in desktop_job.body(10, 10)
    assert "-geometry 7680x4320" in desktop_job.body(99999, 99999)
