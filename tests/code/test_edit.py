"""Opening and saving files for the Code page, against the local bash as the cluster."""

import hashlib
import os
import stat
import sys

import pytest

from hpc_hub.code import edit
from hpc_hub.files.remote_fs import FsError
from tests.helpers import LocalShell

pytestmark = pytest.mark.skipif(sys.platform != "linux", reason="the stand-in cluster needs GNU stat, sha256sum, "
                                                                "find and base64; clusters run Linux")


def sha(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


@pytest.fixture
def sh():
    return LocalShell()


def test_open_text(sh, tmp_path):
    f = tmp_path / "train.py"
    f.write_bytes(b"import torch\nprint('hi')\n")
    o = edit.open_file(sh, str(f))
    assert o.text == "import torch\nprint('hi')\n" and o.sha == sha(f.read_bytes())
    assert o.eol == "lf" and o.writable and not o.lossy and o.readonly_reason == "" and o.size == 25
    assert o.mtime == int(f.stat().st_mtime)


def test_crlf_round_trip(sh, tmp_path):
    f = tmp_path / "data.csv"
    f.write_bytes(b"a,b\r\n1,2\r\n")
    o = edit.open_file(sh, str(f))
    assert o.text == "a,b\n1,2\n" and o.eol == "crlf"
    r = edit.save(sh, str(f), o.text + "3,4\n", o.sha, o.eol)
    assert r["saved"] and f.read_bytes() == b"a,b\r\n1,2\r\n3,4\r\n" and r["sha"] == sha(f.read_bytes())


def test_not_utf8_or_binary_is_read_only(sh, tmp_path):
    latin = tmp_path / "notes.txt"
    latin.write_bytes("café\n".encode("latin-1"))
    o = edit.open_file(sh, str(latin))
    assert o.lossy and not o.writable and o.text == "" and o.readonly_reason == "Not UTF-8 text"
    blob = tmp_path / "model.bin"
    blob.write_bytes(b"\x00\x01\x02abc")
    assert edit.open_file(sh, str(blob)).readonly_reason == "Not a text file"


def test_big_file_shows_its_end(sh, tmp_path):
    f = tmp_path / "slurm-1.out"
    f.write_text("".join(f"step {i}\n" for i in range(1000)))
    o = edit.open_file(sh, str(f), limit=100)
    assert not o.writable and o.readonly_reason.startswith("Bigger than")
    assert o.text.endswith("step 999\n") and not o.text.startswith("ep")  # the cut first line is dropped
    assert o.sha == sha(f.read_bytes()) and o.size == f.stat().st_size


def test_no_write_permission(sh, tmp_path):
    if os.geteuid() == 0:
        pytest.skip("root can write anything")
    f = tmp_path / "shared.py"
    f.write_text("x = 1\n")
    f.chmod(0o444)
    o = edit.open_file(sh, str(f))
    assert not o.writable and o.readonly_reason == "No write permission"


def test_open_errors(sh, tmp_path):
    with pytest.raises(FsError, match="No such file"):
        edit.open_file(sh, str(tmp_path / "missing.py"))
    with pytest.raises(FsError, match="folder"):
        edit.open_file(sh, str(tmp_path))


def test_save_checks_nobody_changed_it(sh, tmp_path):
    f = tmp_path / "run.sh"
    f.write_text("echo one\n")
    o = edit.open_file(sh, str(f))
    f.write_text("echo agent\n")  # an agent edits it meanwhile
    r = edit.save(sh, str(f), "echo mine\n", o.sha)
    assert r == {"saved": False, "conflict": True, "sha": sha(b"echo agent\n"), "mtime": r["mtime"]}
    assert f.read_text() == "echo agent\n"
    assert edit.save(sh, str(f), "echo mine\n", o.sha, force=True)["saved"]
    assert f.read_text() == "echo mine\n"


def test_save_when_the_file_is_gone_or_new(sh, tmp_path):
    f = tmp_path / "gone.py"
    f.write_text("x\n")
    o = edit.open_file(sh, str(f))
    f.unlink()
    assert edit.save(sh, str(f), "y\n", o.sha) == {"saved": False, "conflict": True, "sha": "", "mtime": 0.0}
    new = tmp_path / "new.py"
    assert edit.save(sh, str(new), "z\n", "")["saved"] and new.read_text() == "z\n"
    assert not edit.save(sh, str(new), "w\n", "")["saved"]  # "" means new: someone made it meanwhile


def test_save_keeps_mode_and_links(sh, tmp_path):
    script = tmp_path / "job.sbatch"
    script.write_text("#!/bin/bash\necho hi\n")
    script.chmod(0o750)
    link = tmp_path / "current.sbatch"
    link.symlink_to(script)
    o = edit.open_file(sh, str(link))
    assert edit.save(sh, str(link), "#!/bin/bash\necho bye\n", o.sha)["saved"]
    assert link.is_symlink() and script.read_text() == "#!/bin/bash\necho bye\n"
    assert stat.S_IMODE(script.stat().st_mode) == 0o750
    assert not [p for p in tmp_path.iterdir() if "hpchub" in p.name]  # no temp file left


def test_stat(sh, tmp_path):
    a = tmp_path / "a.py"
    a.write_text("a\n")
    out = edit.stat(sh, [str(a), str(tmp_path / "nope.py")])
    assert out[0] == edit.FileState(str(a), True, sha(b"a\n"), float(int(a.stat().st_mtime)), 2)
    assert out[1] == edit.FileState(str(tmp_path / "nope.py"), False, "", 0.0, 0)
    assert edit.stat(sh, []) == []


def test_new_file_never_overwrites(sh, tmp_path):
    f = tmp_path / "test_train.py"
    edit.new_file(sh, str(f), "def test_x():\n    pass\n")
    assert f.read_text() == "def test_x():\n    pass\n"
    with pytest.raises(FsError, match="exists"):
        edit.new_file(sh, str(f), "other")
    assert f.read_text() == "def test_x():\n    pass\n"


def test_find_files_skips_noise(sh, tmp_path):
    for p in ("src/train.py", "src/train_utils.py", ".git/train.py", "node_modules/x/train.py",
              "__pycache__/train.cpython.pyc", "docs/README.md"):
        (tmp_path / p).parent.mkdir(parents=True, exist_ok=True)
        (tmp_path / p).write_text("x")
    found = edit.find_files(sh, str(tmp_path), "TRAIN")
    assert [f["name"] for f in found] == ["train.py", "train_utils.py"]
    assert found[0]["path"] == str(tmp_path / "src/train.py")
    assert len(edit.find_files(sh, str(tmp_path), "")) == 3
    assert edit.find_files(sh, str(tmp_path), "[*") == []  # glob characters are literal


def test_grep(sh, tmp_path):
    (tmp_path / "src").mkdir()
    (tmp_path / "src/train.py").write_text("lr = 0.01\nepochs = 3\nLR_DECAY = 0.9\n")
    (tmp_path / "src/blob.bin").write_bytes(b"\x00lr = 1")
    hits = edit.grep(sh, str(tmp_path), "lr")
    assert [(h["path"].rsplit("/", 1)[-1], h["line"]) for h in hits] == [("train.py", 1), ("train.py", 3)]
    assert hits[0]["text"] == "lr = 0.01"
    assert [h["line"] for h in edit.grep(sh, str(tmp_path), "lr", ignore_case=False)] == [1]
    assert edit.grep(sh, str(tmp_path), "  ") == []


def test_grep_without_rg_uses_grep():
    cmd = edit.grep_command("/home/jdoe/proj", "a b", ignore_case=False)
    assert "command -v rg" in cmd and "grep -rnIF --exclude-dir=.git" in cmd and "'a b'" in cmd


def test_decode_rules():
    assert edit.decode(b"a\r\nb", 4, 10, True) == ("a\nb", "crlf", False, "")
    assert edit.decode(b"a\nb", 3, 10, False) == ("a\nb", "lf", False, "No write permission")
    assert edit.encode("a\nb\n", "crlf") == b"a\r\nb\r\n" and edit.encode("a\r\nb", "lf") == b"a\nb"
