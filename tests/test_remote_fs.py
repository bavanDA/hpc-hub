import pytest

from hpc_hub import remote_fs


def test_parse_listing():
    text = "f\t120\t1700000000.5\tb.txt\nd\t4096\t1700000001.0\tZdir\nd\t4096\t1.0\tadir\nf\tx\t1\tbad\n"
    names = [e.name for e in remote_fs.parse_listing(text)]
    assert names == ["adir", "Zdir", "b.txt"]


def test_zip_commands():
    assert remote_fs.zip_command("/home/u/my proj/") == (
        "cd /home/u && if command -v zip >/dev/null; then zip -qry 'my proj.zip' 'my proj'; "
        "else tar czf 'my proj.tar.gz' 'my proj'; fi")
    assert remote_fs.unzip_command("/x/a.zip") == "cd /x && unzip -oq a.zip"
    assert remote_fs.unzip_command("/x/a.tar.gz") == "cd /x && tar xf a.tar.gz"
    with pytest.raises(remote_fs.FsError):
        remote_fs.unzip_command("/x/a.txt")


def test_remove_guard():
    with pytest.raises(remote_fs.FsError):
        remote_fs.remove(None, "/")
    with pytest.raises(remote_fs.FsError):
        remote_fs.remove(None, "/home")
