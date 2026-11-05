"""The History RPCs through a fake hub whose clusters run commands locally."""

import os
import subprocess
import time

import pytest

from hpc_hub.api import hub as hub_module
from hpc_hub.api.methods import latex as latex_api
from hpc_hub.api.methods import latex_history as api
from hpc_hub.latex import saved
from tests.api.test_latex_api import FakeHub

ENV = {**os.environ, "GIT_AUTHOR_NAME": "jdoe", "GIT_AUTHOR_EMAIL": "jdoe@example.edu", "GIT_COMMITTER_NAME": "jdoe",
       "GIT_COMMITTER_EMAIL": "jdoe@example.edu"}


def git(repo, *args):
    return subprocess.run(["git", "-C", str(repo), *args], capture_output=True, text=True, env=ENV,
                          check=True).stdout


@pytest.fixture
def h(monkeypatch):
    fake = FakeHub()
    monkeypatch.setattr(hub_module, "_hub", fake)
    monkeypatch.setattr(saved, "_last", {})
    return fake


@pytest.fixture
def repo(tmp_path):
    r = tmp_path / "paper"
    r.mkdir()
    git(tmp_path, "init", "-q", "-b", "main", str(r))
    git(r, "config", "user.name", "jdoe")
    git(r, "config", "user.email", "jdoe@example.edu")
    (r / "main.tex").write_text("\\documentclass{article}\n\\begin{document}\nHello.\n\\end{document}\n")
    git(r, "add", "-A")
    git(r, "commit", "-qm", "First draft")
    git(r, "branch", "camera-ready")
    return r


def wait(h, name, pred=lambda e: True, seconds=60):
    end = time.time() + seconds
    while time.time() < end:
        for n, e in h.events:
            if n == name and pred(e):
                return e
        time.sleep(0.05)
    raise AssertionError(f"no {name} event")


def test_state_log_and_changes(h, repo):
    (repo / "main.tex").write_text((repo / "main.tex").read_text().replace("Hello", "Hello again"))
    st = api.git_state("wulver", str(repo))
    assert st["branch"] == "main" and st["changes"][0]["path"] == "main.tex"
    assert api.git_log("wulver", str(repo))[0]["subject"] == "First draft"
    c = api.git_changes("wulver", str(repo))
    row = next(r for f in c["files"] for hk in f["hunks"] for r in hk["rows"] if r["k"] == "+")
    assert [row["t"][a:b] for a, b in row["m"]] == ["again"]


def test_switch_is_a_job_with_steps(h, repo):
    (repo / "notes.tex").write_text("x\n")
    assert api.git_switch_check("wulver", str(repo), "camera-ready")["bring"]
    job = api.git_switch("wulver", str(repo), "camera-ready", "bring")
    end = wait(h, "latex-git", lambda e: e["id"] == job["id"] and e["done"])
    assert end["ok"] and end["result"]["branch"] == "camera-ready" and end["kind"] == "switch"
    assert end["steps"][0]["label"].startswith("Made a safe copy") and all(s["done"] for s in end["steps"])
    assert git(repo, "branch", "--show-current").strip() == "camera-ready"


def test_a_failed_job_says_why(h, repo):
    job = api.git_sync("wulver", str(repo), True)
    end = wait(h, "latex-git", lambda e: e["id"] == job["id"] and e["done"])
    assert not end["ok"] and "no remote" in end["error"]


def test_old_version_pdf(h, repo):
    head = git(repo, "rev-parse", "HEAD").strip()
    r = api.git_pdf("wulver", str(repo), str(repo / "main.tex"), head)
    assert "id" in r
    end = wait(h, "latex-git-pdf", lambda e: e["id"] == r["id"], seconds=120)
    if end["ok"]:  # pdflatex is here: the second ask is instant
        assert api.git_pdf("wulver", str(repo), str(repo / "main.tex"), head) == {"path": end["path"]}
    else:
        assert end["error"]


def test_a_save_keeps_a_version(h, repo):
    latex_api.write("wulver", str(repo / "main.tex"), "changed\n")
    end = time.time() + 20
    while time.time() < end and not api.git_saved("wulver", str(repo)):
        time.sleep(0.1)
    [v] = api.git_saved("wulver", str(repo))
    assert v["kind"] == "Saved" and v["files"] == ["main.tex"]
    assert api.git_saved_setting("wulver", str(repo), "off") == "off"
    assert api.git_state("wulver", str(repo))["saved"] == "off"
