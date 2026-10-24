import base64
import gzip
import shlex
import subprocess
import time
from types import SimpleNamespace

import pytest

from hpc_hub.api import hub as hub_module
from hpc_hub.api.methods import latex as api
from hpc_hub.core.config import LatexSettings
from hpc_hub.projects import store
from hpc_hub.projects.store import Project
from tests.helpers import LocalShell


class FakeHub:
    """'Clusters' that run commands locally; events are kept."""

    def __init__(self):
        self.events: list[tuple[str, dict]] = []
        self.saved = 0
        self.sessions = {c: SimpleNamespace(cfg=SimpleNamespace(id=c, name=c.title(), latex=LatexSettings()),
                                            ssh=LocalShell(), connected=True, allocation=None)
                         for c in ("wulver", "yale")}
        self.sessions["sdsc"] = SimpleNamespace(cfg=SimpleNamespace(id="sdsc", name="Expanse", latex=LatexSettings()),
                                                ssh=None, connected=False, allocation=None)

    def session(self, cluster):
        return self.sessions[cluster]

    def connected(self, cluster):
        s = self.sessions[cluster]
        if not s.connected:
            raise RuntimeError(f"Connect to {s.cfg.name} first")
        return s

    def emit(self, name, data):
        self.events.append((name, data))

    def save_clusters(self):
        self.saved += 1


@pytest.fixture
def h(monkeypatch, tmp_path):
    fake = FakeHub()
    monkeypatch.setattr(hub_module, "_hub", fake)
    monkeypatch.setattr(store, "PROJECTS_FILE", tmp_path / "projects.toml")
    monkeypatch.setenv("XDG_CACHE_HOME", str(tmp_path / "cache"))
    monkeypatch.setattr(api, "_syncs", {})
    return fake


@pytest.fixture
def paper(tmp_path):
    d = tmp_path / "paper"
    (d / "sections").mkdir(parents=True)
    (d / "figures").mkdir()
    (d / ".git").mkdir()
    (d / "main.tex").write_text("\\documentclass{article}\n\\begin{document}\nHi\n\\end{document}\n")
    (d / "sections" / "intro.tex").write_text("Intro\n")
    (d / "refs.bib").write_text("@article{a,}\n")
    (d / "main.aux").write_text("")
    (d / "main.synctex.gz").write_bytes(b"")
    (d / "figures" / "plot.png").write_bytes(b"\x89PNG\0\0")
    return d


def _wait(h, name, bid, seconds=10):
    end = time.monotonic() + seconds
    while time.monotonic() < end:
        got = [d for n, d in h.events if n == name and d["id"] == bid]
        if got:
            return got[-1]
        time.sleep(0.02)
    raise AssertionError(f"no {name} event")


def test_open_a_tex_file_remembers_the_project_and_lists_the_tree(h, paper):
    got = api.open_project("wulver", str(paper / "main.tex"))
    assert got["main"] == str(paper / "main.tex") and got["folder"] == str(paper)
    assert got["name"] == "paper" and got["cluster_name"] == "Wulver"
    assert got["tree"] == [{"kind": "d", "path": "figures"}, {"kind": "f", "path": "figures/plot.png"},
                           {"kind": "f", "path": "main.tex"}, {"kind": "f", "path": "refs.bib"},
                           {"kind": "d", "path": "sections"}, {"kind": "f", "path": "sections/intro.tex"}]
    assert got["settings"] == {"setup": "", "engine": "pdf", "on_node": True}
    p = store.load(store.PROJECTS_FILE)[0]
    assert (p.cluster, p.path, p.main_tex, p.kind) == ("wulver", str(paper), "main.tex", "latex") and p.opened
    with pytest.raises(FileNotFoundError):
        api.open_project("wulver", str(paper / "nope.tex"))
    with pytest.raises(RuntimeError, match="Connect to Expanse first"):
        api.open_project("sdsc", "~/paper/main.tex")


def test_open_a_folder_asks_which_main_file_when_there_are_two(h, paper):
    (paper / "poster.tex").write_text("\\documentclass{beamer}\n")
    got = api.open_project("wulver", str(paper))
    assert got == {"choices": ["main.tex", "poster.tex"], "folder": str(paper)}
    assert api.open_project("wulver", str(paper), main="poster.tex")["main"] == str(paper / "poster.tex")
    assert api.open_project("wulver", str(paper))["main"] == str(paper / "poster.tex")  # remembered
    api.set_main("wulver", str(paper), str(paper / "main.tex"))
    assert store.load(store.PROJECTS_FILE)[0].main_tex == "main.tex"
    with pytest.raises(ValueError, match="outside"):
        api.set_main("wulver", str(paper), "/etc/passwd")


def test_picker_shows_latex_projects_and_saved_papers(h, tmp_path, monkeypatch):
    store.save([Project("thesis", "wulver", "/home/jdoe/thesis", "main.tex", opened=5, kind="latex"),
                Project("code", "wulver", "/home/jdoe/code", kind="code"),
                Project("gone", "nowhere", "/x", "main.tex", kind="latex")], store.PROJECTS_FILE)
    home = tmp_path / "home"
    (home / "notes" / "draft").mkdir(parents=True)
    (home / "notes" / "draft" / "paper.tex").write_text("\\documentclass{article}\n")
    (home / "notes" / "draft" / "part.tex").write_text("no class here\n")
    monkeypatch.setenv("HOME", str(home))
    found = api.scan("wulver")
    assert [(p["main"], p["title"], p["others"]) for p in found] == [("paper.tex", "notes / draft", 0)]
    got = api.picker()
    assert [p["name"] for p in got["projects"]] == ["thesis"]
    assert got["projects"][0]["id"] == "wulver:/home/jdoe/thesis"
    assert [p["folder"] for p in got["papers"]] == [str(home / "notes" / "draft")]
    assert set(got["found_at"]) == {"wulver"}
    assert [c["connected"] for c in got["clusters"]] == [True, True, False]
    api.forget("wulver", "/home/jdoe/thesis/")
    assert [p.name for p in store.load(store.PROJECTS_FILE)] == ["code", "gone"]


def test_short_names():
    assert api.short("/mmfs1/scratch/mygroup/jdoe/thesis/paper") == "scratch/thesis/paper"
    assert api.short("/home/jdoe/papers/a") == "~/papers/a"


def test_files_read_write_and_manage_inside_the_project_only(h, paper):
    f = str(paper)
    assert api.read("wulver", f + "/main.tex")["text"].startswith("\\documentclass")
    api.write("wulver", f + "/main.tex", "é\n")
    assert (paper / "main.tex").read_text() == "é\n"
    assert api.new_file("wulver", f, f + "/sections", "methods.tex") == f + "/sections/methods.tex"
    with pytest.raises(FileExistsError):
        api.new_file("wulver", f, f + "/sections", "methods.tex")
    assert api.mkdir("wulver", f, "", "tables") == f + "/tables"
    assert api.move("wulver", f, f + "/sections/methods.tex", f + "/tables") == f + "/tables/methods.tex"
    assert api.move("wulver", f, f + "/tables/methods.tex", "") == f + "/methods.tex"
    with pytest.raises(ValueError, match="inside itself"):
        api.move("wulver", f, f + "/tables", f + "/tables")
    assert api.rename("wulver", f, f + "/methods.tex", "method.tex") == f + "/method.tex"
    with pytest.raises(ValueError):
        api.rename("wulver", f, f + "/method.tex", "../x.tex")
    api.delete("wulver", f, f + "/tables")
    assert not (paper / "tables").exists()
    for bad in (f, f + "/../other", "/etc"):
        with pytest.raises(ValueError, match="outside"):
            api.delete("wulver", f, bad)
    (paper / "a.bin").write_bytes(b"\0\1")
    with pytest.raises(ValueError, match="not a text file"):
        api.read("wulver", f + "/a.bin")


def test_pdf_info_and_chunks(h, paper):
    main = str(paper / "main.tex")
    assert api.pdf("wulver", main) is None
    data = bytes(range(256)) * 40
    (paper / "main.pdf").write_bytes(data)
    info = api.pdf("wulver", main)
    assert info["path"] == str(paper / "main.pdf") and info["size"] == len(data) and info["mtime"] > 0
    parts, offset = [], 0
    while offset < len(data):
        c = api.chunk("wulver", info["path"], offset, 3000)
        assert c["total"] == len(data)
        parts.append(base64.b64decode(c["data"]))
        offset += len(parts[-1])
    assert b"".join(parts) == data and len(parts) == 4
    assert api.chunk("wulver", info["path"], len(data), 10)["data"] == ""
    with pytest.raises(Exception):
        api.chunk("wulver", str(paper / "missing.pdf"))


LOG = """This is pdfTeX
(./main.tex (/usr/share/texmf/article.cls)
(./sections/intro.tex
LaTeX Warning: Citation `knuth' on page 1 undefined on input line 4.
Overfull \\hbox (12.3pt too wide) in paragraph at lines 7--9
)
./main.tex:12: Undefined control sequence.
LaTeX Warning: There were undefined references.
)
"""


def test_issues_errors_first_then_warnings_in_their_file():
    got = api.issues(LOG)
    assert got[0] == {"file": "main.tex", "line": 12, "message": "Undefined control sequence.", "level": "error"}
    assert got[1] == {"file": "intro.tex", "line": 4, "message": "Citation `knuth' on page 1 undefined",
                      "level": "warning"}
    assert got[2] == {"file": "intro.tex", "line": 7, "message": "Overfull \\hbox (12.3pt too wide)", "level": "box"}
    assert got[3] == {"file": "main.tex", "line": 0, "message": "There were undefined references", "level": "warning"}


def test_build_streams_the_log_and_ends_with_issues(h, paper, monkeypatch):
    script = f"cd {paper} && printf '%s' {shlex.quote(LOG)} && echo oops >&2 && : > main.pdf"
    monkeypatch.setattr(api.latex, "build_script", lambda main, s: script)
    bid = api.build("wulver", str(paper / "main.tex"))["id"]
    done = _wait(h, "latex-build", bid)
    assert done["ok"] and done["code"] == 0 and not done["stopped"]
    assert "oops" in done["log"] and "Undefined control sequence" in done["log"]
    assert done["issues"][0]["line"] == 12
    streamed = "".join(d["text"] for n, d in h.events if n == "latex-log" and d["id"] == bid)
    assert streamed == done["log"]
    assert (paper / "main.pdf").exists()
    assert api._builds == {}


def test_build_fails_or_stops(h, paper, monkeypatch):
    monkeypatch.setattr(api.latex, "build_script", lambda main, s: "echo bad; exit 3")
    bid = api.build("wulver", str(paper / "main.tex"))["id"]
    done = _wait(h, "latex-build", bid)
    assert not done["ok"] and done["code"] == 3
    monkeypatch.setattr(api.latex, "build_script", lambda main, s: "sleep 20")
    bid = api.build("wulver", str(paper / "main.tex"))["id"]
    with pytest.raises(RuntimeError, match="building already"):
        api.build("wulver", str(paper / "main.tex"))
    api.stop(bid)
    done = _wait(h, "latex-build", bid)
    assert done["stopped"] and not done["ok"]


def test_build_on_the_compute_node_uses_srun(h):
    s = h.sessions["wulver"]
    s.allocation = SimpleNamespace(job_id="4242", node="n1")
    assert api._build_command("wulver", "/p/main.tex").startswith("srun --jobid=4242 --overlap bash -c ")
    s.cfg.latex.on_node = False
    assert not api._build_command("wulver", "/p/main.tex").startswith("srun")


def test_settings_are_checked_and_saved(h):
    got = api.save_settings("wulver", setup=" module load texlive ", engine="xelatex", on_node=False)
    assert got == {"setup": "module load texlive", "engine": "xelatex", "on_node": False}
    assert h.saved == 1 and api.settings("wulver")["engine"] == "xelatex"
    with pytest.raises(ValueError):
        api.save_settings("wulver", engine="word")


def test_synctex_both_ways(h, paper):
    main = str(paper / "main.tex")
    (paper / "main.synctex.gz").unlink()
    with pytest.raises(RuntimeError, match="Build once"):
        api.sync_view("wulver", main, main, 3)
    sp = 65781.76
    text = (f"SyncTeX Version:1\nInput:1:{paper}/./main.tex\nInput:2:./sections/intro.tex\nUnit:1\n"
            f"{{1\nh1,3:{int(100 * sp)},{int(200 * sp)}:0,0,0\nh2,5:{int(80 * sp)},{int(400 * sp)}:0,0,0\n}}1\n")
    (paper / "main.synctex.gz").write_bytes(gzip.compress(text.encode()))
    got = api.sync_view("wulver", main, main, 3)
    assert got["page"] == 1 and round(got["x"]) == 100 and round(got["y"]) == 200
    assert api.sync_view("wulver", main, str(paper / "sections/intro.tex"), 5)["page"] == 1
    assert api.sync_view("wulver", main, str(paper / "refs.bib"), 1) is None
    assert api.sync_edit("wulver", main, 1, 90, 395) == {"path": str(paper / "sections/intro.tex"), "line": 5}
    assert api.sync_edit("wulver", main, 1, 100, 210) == {"path": main, "line": 3}
    assert api.sync_edit("wulver", main, 2, 0, 0) is None


def _git(folder, *args):
    subprocess.run(["git", "-C", str(folder), "-c", "user.name=jdoe", "-c", "user.email=jdoe@example.org", *args],
                   check=True, capture_output=True)


def test_git_status_commit_history_pull_and_push(h, paper, tmp_path, monkeypatch):
    monkeypatch.setenv("GIT_AUTHOR_NAME", "jdoe")
    monkeypatch.setenv("GIT_AUTHOR_EMAIL", "jdoe@example.org")
    monkeypatch.setenv("GIT_COMMITTER_NAME", "jdoe")
    monkeypatch.setenv("GIT_COMMITTER_EMAIL", "jdoe@example.org")
    (paper / ".git").rmdir()
    f = str(paper)
    assert api.git_info("wulver", f)["root"] == ""
    remote = tmp_path / "remote.git"
    subprocess.run(["git", "init", "-q", "--bare", "-b", "main", str(remote)], check=True)
    _git(paper, "init", "-q", "-b", "main")
    _git(paper, "remote", "add", "origin", str(remote))
    info = api.git_info("wulver", f)
    assert info["root"] == f and info["branch"] == "main"
    assert info["remotes"] == [{"name": "origin", "url": str(remote)}]
    assert {"status": "??", "path": "main.tex"} in info["changes"]
    with pytest.raises(ValueError):
        api.git_commit("wulver", f, "  ")
    api.git_commit("wulver", f, "First draft")
    info = api.git_info("wulver", f)
    assert [c["subject"] for c in info["history"]] == ["First draft"]
    assert [c["path"] for c in info["changes"]] == ["main.aux", "main.synctex.gz"]  # build output stays out
    _git(paper, "push", "-q", "-u", "origin", "main")
    (paper / "refs.bib").write_text("@book{b,}\n")
    api.git_commit("wulver", f, "More refs")
    api.git_push("wulver", f)
    assert "More refs" in subprocess.run(["git", "-C", str(remote), "log"], capture_output=True, text=True).stdout
    api.git_pull("wulver", f)
    shown = api.git_show("wulver", f, info["history"][0]["hash"])
    assert "First draft" in shown and "main.tex" in shown
