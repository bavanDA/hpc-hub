import pytest

from hpc_hub.api.methods import tools, vscode
from hpc_hub.compute.slurm import Allocation

from .test_tools import FakeHub, FakeSession, FakeSsh


@pytest.fixture
def env(monkeypatch):
    s = FakeSession(FakeSsh({'printf %s "$HOME"': "/home/jdoe"}), Allocation("123", "n0042"))
    h = FakeHub(s)
    monkeypatch.setattr(tools, "hub", lambda: h)
    monkeypatch.setattr(vscode, "hub", lambda: h)
    return h


def test_vscode_find(env):
    env.s.ssh.answers = {"squeue -h -u": "991|hpc-hub-vscode|n0007|general\n", "%C|%m": "2|8G|0:10|8:00:00",
                         "grep -ao": "https://vscode.dev/tunnel/abc123/home/jdoe\n"}
    got = vscode.vscode_find("wulver")
    assert got["job"]["id"] == "991" and got["job"]["node"] == "n0007" and got["tunnel"] == "abc123"
    assert "2 cores" in got["job"]["resources"]
    env.s.ssh.answers = {}
    assert vscode.vscode_find("wulver") == {"job": None, "tunnel": ""}


def test_vscode_submits_a_job_and_follows_its_log(env):
    env.s.ssh.answers.update({"sbatch --parsable": "4242\n"})
    got = vscode.vscode_start("wulver", "~/thesis", "browser", profile={"cpus": 4, "time": "01:00:00"}, remember=True)
    assert got["submitted"] == "4242" and got["folder"] == "/home/jdoe/thesis" and got["target"] == "browser"
    assert "4242" in got["follow"]["argv"][-1] and got["follow"]["title"] == "VS Code · Wulver · job 4242"
    v = env.s.cfg.vscode
    assert v.open_in == "browser" and v.compute.cpus == 4 and v.workdir == "~"  # a project folder isn't the default
    assert any("--cpus-per-task=4" in r for r in env.s.ssh.ran)


def test_vscode_uses_the_running_job(env, monkeypatch):
    monkeypatch.setattr(vscode.shutil, "which", lambda name: None)
    env.s.ssh.answers.update({"grep -ao": "https://vscode.dev/tunnel/abc123/home/jdoe\n"})
    got = vscode.vscode_start("wulver", "~/thesis", "desktop", job="991")
    assert got["open"] == {"app": False, "url": "https://vscode.dev/tunnel/abc123/home/jdoe/thesis", "missing": True}
    assert not any("sbatch" in r or "scancel" in r for r in env.s.ssh.ran)
    env.s.ssh.answers["grep -ao"] = ""  # still in the queue: follow it until it prints the tunnel
    assert "follow" in vscode.vscode_start("wulver", "", "desktop", job="991")


def test_vscode_saves_ask_every_time(env):
    env.s.ssh.answers.update({"sbatch --parsable": "4242\n"})
    assert env.s.cfg.vscode.ask and tools.setup("wulver")["vscode"]["ask"]
    vscode.vscode_start("wulver", "", "desktop", ask=False)
    assert not env.s.cfg.vscode.ask and not tools.setup("wulver")["vscode"]["ask"]


def test_vscode_replaces_the_running_job(env):
    env.s.ssh.answers.update({"sbatch --parsable": "5000\n"})
    got = vscode.vscode_start("wulver", "", "desktop", job="991", replace_job=True)
    assert got["submitted"] == "5000" and "scancel 991" in env.s.ssh.ran


def test_vscode_wont_submit_a_second_job(env):
    env.s.ssh.answers.update({"squeue -h -u": "991|hpc-hub-vscode|n0007|general\n", "sbatch --parsable": "5000\n"})
    with pytest.raises(RuntimeError, match="already have a VS Code job \\(991\\)"):
        vscode.vscode_start("wulver", "", "desktop")
    assert not any("sbatch" in r for r in env.s.ssh.ran)


def test_vscode_status_and_stop(env):
    env.s.ssh.answers.update({"@@state": "@@state RUNNING|n0007|None|x\n@@done \n@@log\n"
                              "To grant access to the server, please log into https://github.com/login/device "
                              "and use code AB12-CD34\n@@end\n"})
    got = vscode.vscode_status("wulver", "991")
    assert got["phase"] == "login" and got["device"]["code"] == "AB12-CD34"
    assert got["follow"]["title"] == "VS Code · Wulver · job 991"
    vscode.vscode_stop("wulver", "991")
    assert "scancel 991" in env.s.ssh.ran
    with pytest.raises(ValueError):
        vscode.vscode_status("wulver", "991; rm -rf ~")


def test_vscode_open_in_the_app(monkeypatch):
    started = []
    monkeypatch.setattr(vscode.shutil, "which", lambda name: "/usr/bin/code")
    monkeypatch.setattr(vscode.sys, "platform", "linux")
    monkeypatch.setattr(vscode.subprocess, "Popen", lambda argv, **kw: started.append(argv))
    assert vscode.vscode_open("abc123", "/home/jdoe", "desktop")["app"]
    assert started == [["/usr/bin/code", "--folder-uri", "vscode-remote://tunnel+abc123/home/jdoe"]]
    assert vscode.vscode_open("abc123", "/home/jdoe", "browser")["url"] == "https://vscode.dev/tunnel/abc123/home/jdoe"
    with pytest.raises(ValueError):
        vscode.vscode_open("abc; rm", "/")


def test_vscode_open_on_windows_runs_code_exe(monkeypatch):
    started = []
    monkeypatch.setattr(vscode.shutil, "which", lambda name: r"C:\VS Code\bin\code.cmd")
    monkeypatch.setattr(vscode.os.path, "isfile", lambda path: path == r"C:\VS Code\Code.exe")
    monkeypatch.setattr(vscode.subprocess, "Popen", lambda argv, **kw: started.append(argv))
    assert vscode.vscode_open("abc123", "/home/jdoe", "desktop")["app"]
    # Code.exe itself: Windows can't start code.cmd by its bare name, and cmd.exe would read & or % in a folder
    assert started == [[r"C:\VS Code\Code.exe", "--folder-uri", "vscode-remote://tunnel+abc123/home/jdoe"]]


def test_forward_a_node_web_server(env):
    assert vscode.forward("wulver", "http://localhost:8000/?tkn=x", node="n0042") == "http://127.0.0.1:50123/?tkn=x"
    assert env.s.ssh.forwarded == ("n0042", 8000)
    with pytest.raises(ValueError):
        vscode.forward("wulver", "https://example.com")
