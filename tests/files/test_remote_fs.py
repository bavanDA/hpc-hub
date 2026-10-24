import pytest

from hpc_hub.files import remote_fs
from tests.helpers import LocalShell


def test_parse_listing():
    text = "f\t120\t1700000000.5\tb.txt\nd\t4096\t1700000001.0\tZdir\nd\t4096\t1.0\tadir\nf\tx\t1\tbad\n"
    names = [e.name for e in remote_fs.parse_listing(text)]
    assert names == ["adir", "Zdir", "b.txt"]


def test_zip_commands():
    assert remote_fs.zip_command("/home/u/my proj/") == (
        "cd /home/u && if command -v zip >/dev/null; then zip -qry './my proj.zip' './my proj'; "
        "else tar czf './my proj.tar.gz' './my proj'; fi")
    assert remote_fs.unzip_command("/x/a.zip") == "cd /x && unzip -oq ./a.zip"
    assert remote_fs.unzip_command("/x/a.tar.gz") == "cd /x && tar xf ./a.tar.gz"
    cmd = remote_fs.zip_command("/x/--checkpoint-action=exec=sh")
    assert " ./--checkpoint-action=exec=sh" in cmd and " --checkpoint" not in cmd
    with pytest.raises(remote_fs.FsError):
        remote_fs.unzip_command("/x/a.txt")


def test_remove_guard():
    with pytest.raises(remote_fs.FsError):
        remote_fs.remove(None, "/")
    with pytest.raises(remote_fs.FsError):
        remote_fs.remove(None, "/home")


def test_roundtrip_on_local_shell(tmp_path):
    sh, d = LocalShell(), tmp_path / "proj dir"
    remote_fs.mkdir(sh, str(d / "sub"))
    remote_fs.write_bytes(sh, str(d / "a.tex"), b"\\documentclass{article}")
    assert remote_fs.read_bytes(sh, str(d / "a.tex")) == b"\\documentclass{article}"
    assert [e.name for e in remote_fs.list_dir(sh, str(d))] == ["sub", "a.tex"]
    remote_fs.rename(sh, str(d / "a.tex"), str(d / "b.tex"))
    with pytest.raises(remote_fs.FsError):
        remote_fs.rename(sh, str(d / "b.tex"), str(d / "sub"))
    remote_fs.make_zip(sh, str(d))
    archive = next(p for p in tmp_path.iterdir() if p.name.startswith("proj dir."))
    remote_fs.remove(sh, str(d))
    assert not d.exists()
    remote_fs.extract(sh, str(archive))
    assert (d / "b.tex").read_bytes() == b"\\documentclass{article}"
    with pytest.raises(remote_fs.FsError):
        remote_fs.read_bytes(sh, str(d / "b.tex"), limit=4)


def test_list_dir_follows_link(tmp_path):
    real = tmp_path / "real"
    (real / "inside").mkdir(parents=True)
    (tmp_path / "link").symlink_to(real)
    assert [e.name for e in remote_fs.list_dir(LocalShell(), str(tmp_path / "link"))] == ["inside"]


def test_places(tmp_path, monkeypatch):
    home = tmp_path / "home"
    (home / "work").mkdir(parents=True)
    proj = tmp_path / "proj"
    proj.mkdir()
    (home / "project_pi").symlink_to(proj)
    (home / "dup").symlink_to(home / "work")
    monkeypatch.setenv("HOME", str(home))
    monkeypatch.setenv("SCRATCH", str(home / "work"))
    monkeypatch.delenv("PROJECT", raising=False)
    monkeypatch.delenv("WORK", raising=False)
    got = [(p.label, p.path) for p in remote_fs.places(LocalShell())]
    assert got[0] == ("Home", str(home))
    assert ("scratch", str(home / "work")) in got and ("project_pi", str(home / "project_pi")) in got
    assert not any(label == "dup" for label, _ in got)  # same folder as scratch


def test_storage_names():
    P = remote_fs.Place
    wulver = [P("Home", "/home/me"), P("scratch/mygroup", "/scratch/mygroup/me"),
              P("project/mygroup", "/project/mygroup/me")]
    assert [p.label for p in remote_fs.storage(wulver)] == ["Home", "Scratch", "Project"]
    expanse = [P("Home", "/home/me"), P("projects/abc123", "/expanse/lustre/projects/abc123/me"),
               P("projects/abc", "/expanse/lustre/projects/abc/me"), P("work", "/work/me"),
               P("scratch/me", "/expanse/lustre/scratch/me/temp_project")]
    assert [p.label for p in remote_fs.storage(expanse)] == ["Home", "Project (abc123)", "Project (abc)", "Scratch"]


def test_parse_places_skips_junk():
    text = "Home\t/h\t/h\nbad line\nx\t/h2\t/h\n"
    assert [(p.label, p.path) for p in remote_fs.parse_places(text)] == [("Home", "/h")]
