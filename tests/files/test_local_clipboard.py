import pytest

from hpc_hub.files import local_clipboard


def test_from_uris():
    gnome = "copy\nfile:///home/jdoe/My%20data/a.csv\nfile:///home/jdoe/runs\n"
    assert local_clipboard.from_uris(gnome) == ["/home/jdoe/My data/a.csv", "/home/jdoe/runs"]
    assert local_clipboard.from_uris("# comment\r\nfile://localhost/tmp/x\r\nhttps://example.org/y\r\n"
                                     "file://otherhost/z\n") == ["/tmp/x"]


def test_wayland(tmp_path, monkeypatch):
    f = tmp_path / "a b.txt"
    f.write_text("hi")
    answers = {"--list-types": "text/plain\ntext/uri-list\n", "--no-newline": f"file://{tmp_path}/a%20b.txt\r\nfile:///gone\r\n"}
    monkeypatch.setenv("WAYLAND_DISPLAY", "wayland-0")
    monkeypatch.setattr(local_clipboard.shutil, "which", lambda name: "/usr/bin/" + name)
    monkeypatch.setattr(local_clipboard, "_run", lambda argv, timeout=5: answers[argv[1]])
    assert local_clipboard.copied_files("linux") == [str(f)]  # one that is not there is left out
    answers["--list-types"] = "text/plain\n"
    assert local_clipboard.copied_files("linux") == []


def test_no_tool(monkeypatch):
    monkeypatch.setattr(local_clipboard.shutil, "which", lambda name: None)
    with pytest.raises(local_clipboard.Unreadable):
        local_clipboard.copied_files("linux")


def test_windows_and_mac(tmp_path, monkeypatch):
    (tmp_path / "x").write_text("")
    seen = []
    monkeypatch.setattr(local_clipboard, "_run", lambda argv, timeout=5: seen.append(argv[0]) or f"{tmp_path}/x\n")
    assert local_clipboard.copied_files("win32") == [f"{tmp_path}/x"]
    assert local_clipboard.copied_files("darwin") == [f"{tmp_path}/x"]
    assert seen == ["powershell", "osascript"]
