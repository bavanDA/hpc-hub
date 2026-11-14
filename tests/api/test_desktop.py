import pytest

from hpc_hub.api.methods import desktop
from hpc_hub.compute.slurm import Allocation

from .test_tools import FakeHub, FakeSession, FakeSsh

READY = "@@state RUNNING|n0042|None\n@@done \n@@display 3\n@@error \n@@end\n"


@pytest.fixture
def env(monkeypatch):
    s = FakeSession(FakeSsh({'printf %s "$HOME"': "/home/jdoe"}), Allocation("123", "n0042"))
    h = FakeHub(s)
    monkeypatch.setattr(desktop, "hub", lambda: h)
    yield h
    for b in desktop._bridges.values():
        b.close()
    desktop._bridges.clear()


def test_start_submits_a_desktop_job(env):
    env.s.ssh.answers.update({"sbatch --parsable": "4242\n"})
    assert desktop.start("wulver", {"cpus": 4, "time": "02:00:00"}, 1920, 1080) == {"job": "4242"}
    script = next(r for r in env.s.ssh.ran if "sbatch" in r)
    assert "hpc-hub-desktop" in script and "-geometry 1920x1080" in script and "--cpus-per-task=4" in script


def test_one_desktop_per_cluster(env):
    env.s.ssh.answers.update({"squeue -h -u": "991|hpc-hub-desktop|n0007|general\n"})
    assert desktop.find("wulver") == {"job": {"id": "991", "node": "n0007"}}
    with pytest.raises(RuntimeError, match="already have a desktop"):
        desktop.start("wulver")


def test_open_forwards_the_port_and_gives_the_viewer_its_way_in(env):
    env.s.ssh.answers.update({"@@display": READY, "/password": "Ab3dEf9h\n"})
    got = desktop.open_("wulver", "777")
    assert env.s.ssh.forwarded == ("n0042", 5903)  # display 3
    assert got["password"] == "Ab3dEf9h" and got["url"].startswith("ws://127.0.0.1:") and got["node"] == "n0042"
    assert desktop.open_("wulver", "777")["url"] == got["url"], "opening again reuses the bridge"


def test_open_before_it_is_ready_says_so(env):
    queued = "@@state PENDING|(Priority)|Priority\n@@done \n@@display \n@@error \n@@end\n"
    env.s.ssh.answers.update({"@@display": queued})
    with pytest.raises(RuntimeError, match="isn't ready"):
        desktop.open_("wulver", "777")


def test_stop_ends_the_job_its_folder_and_the_bridge(env):
    env.s.ssh.answers.update({"@@display": READY, "/password": "Ab3dEf9h\n"})
    desktop.open_("wulver", "777")
    bridge = desktop._bridges["wulver/777"]
    desktop.stop("wulver", "777")
    assert "scancel 777" in env.s.ssh.ran and any("rm -rf" in r and "desktop/777" in r for r in env.s.ssh.ran)
    assert bridge.closed and "wulver/777" not in desktop._bridges


def test_job_ids_are_checked(env):
    for call in (lambda: desktop.status("wulver", "7; rm -rf ~"), lambda: desktop.stop("wulver", "x")):
        with pytest.raises(ValueError):
            call()
