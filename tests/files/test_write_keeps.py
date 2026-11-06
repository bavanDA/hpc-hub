"""remote_fs.write_bytes keeps a file's mode and its link."""

import os
import stat
import sys

import pytest

from hpc_hub.files import remote_fs
from tests.helpers import LocalShell

pytestmark = pytest.mark.skipif(sys.platform != "linux", reason="the stand-in cluster needs GNU stat; "
                                                                "clusters run Linux")


def test_write_keeps_mode_and_link(tmp_path):
    script = tmp_path / "run.sh"
    script.write_text("echo one\n")
    script.chmod(0o755)
    link = tmp_path / "latest.sh"
    link.symlink_to(script)
    remote_fs.write_bytes(LocalShell(), str(link), b"echo two\n")
    assert link.is_symlink() and script.read_bytes() == b"echo two\n"
    assert stat.S_IMODE(script.stat().st_mode) == 0o755
    assert sorted(p.name for p in tmp_path.iterdir()) == ["latest.sh", "run.sh"]


def test_write_new_file_uses_umask(tmp_path):
    old = os.umask(0o022)  # the temp file starts 0600; a new file must end up like any other: 0644 here
    try:
        new = tmp_path / "notes.md"
        remote_fs.write_bytes(LocalShell(), str(new), b"# notes\n")
    finally:
        os.umask(old)
    assert new.read_bytes() == b"# notes\n" and stat.S_IMODE(new.stat().st_mode) == 0o644


def test_write_error_is_plain(tmp_path):
    with pytest.raises(remote_fs.FsError):
        remote_fs.write_bytes(LocalShell(), str(tmp_path / "no-such-dir" / "x.txt"), b"x")
