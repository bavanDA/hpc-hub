import pytest

from hpc_hub.core import downloads


def setting(tmp_path, line):
    (tmp_path / ".config").mkdir(exist_ok=True)
    (tmp_path / ".config" / "user-dirs.dirs").write_text(f"# written by xdg-user-dirs-update\n{line}\n")


def test_downloads_folder(tmp_path):
    kw = {"home": tmp_path, "platform": "linux", "env": {}}
    assert downloads.downloads(**kw) == tmp_path / "Downloads"  # no setting
    setting(tmp_path, 'XDG_DOWNLOAD_DIR="$HOME/"')  # Downloads is home itself: Tauri finds none, we take it
    assert downloads.downloads(**kw) == tmp_path
    (tmp_path / "Dl").mkdir()
    setting(tmp_path, 'XDG_DOWNLOAD_DIR="$HOME/Dl"')
    assert downloads.downloads(**kw) == tmp_path / "Dl"
    setting(tmp_path, 'XDG_DOWNLOAD_DIR="$HOME/gone"')  # named but not there
    assert downloads.downloads(**kw) == tmp_path / "Downloads"
    assert downloads.downloads(home=tmp_path, platform="darwin", env={}) == tmp_path / "Downloads"


def test_cluster_folder_and_open_guard(tmp_path, monkeypatch):
    kw = {"home": tmp_path, "platform": "linux", "env": {}}
    folder = downloads.cluster_folder("wulver", **kw)
    assert folder == tmp_path / "Downloads" / "HPC Hub" / "wulver" and folder.is_dir()
    assert downloads.cluster_folder("../x", **kw).parent == tmp_path / "Downloads" / "HPC Hub"
    assert downloads.inside_app_folder(folder / "a.html", **kw)
    assert not downloads.inside_app_folder(tmp_path / "a.html", **kw)
    monkeypatch.setattr(downloads, "downloads", lambda **_: tmp_path / "Downloads")
    monkeypatch.setattr(downloads.sys, "platform", "linux")  # xdg-open; Windows opens with os.startfile
    opened = []
    monkeypatch.setattr(downloads.subprocess, "Popen", lambda argv, **_: opened.append(argv))
    page = folder / "a.html"
    page.write_text("hi")
    downloads.open_here(str(page))
    assert opened and opened[0][-1] == str(page)
    with pytest.raises(ValueError):
        downloads.open_here(str(tmp_path / "elsewhere.sh"))


@pytest.mark.parametrize(("platform", "want"), [
    ("linux", lambda p: ["xdg-open", str(p.parent)]),
    ("darwin", lambda p: ["open", "-R", str(p)]),
    ("win32", lambda p: ["explorer", "/select,", str(p)]),
])
def test_show_in_folder(tmp_path, monkeypatch, platform, want):
    monkeypatch.setattr(downloads, "downloads", lambda **_: tmp_path / "Downloads")
    monkeypatch.setattr(downloads.sys, "platform", platform)
    shown = []
    monkeypatch.setattr(downloads.subprocess, "Popen", lambda argv, **_: shown.append(argv))
    pdf = downloads.cluster_folder("wulver") / "thesis (1).pdf"
    pdf.write_bytes(b"%PDF-1.5")
    downloads.show_here(str(pdf))
    assert shown == [want(pdf)]
    with pytest.raises(ValueError):  # only what HPC Hub saved, and only while it is there
        downloads.show_here(str(tmp_path / "elsewhere.pdf"))
    with pytest.raises(ValueError):
        downloads.show_here(str(pdf.parent / "gone.pdf"))
