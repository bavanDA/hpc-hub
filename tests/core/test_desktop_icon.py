from hpc_hub.core import desktop_icon


def setup(tmp_path, bundled=b"new", entry_icon="hpc-hub", old=None):
    app = tmp_path / "app"
    (app / desktop_icon.INSIDE).parent.mkdir(parents=True)
    (app / desktop_icon.INSIDE).write_bytes(bundled)
    home = tmp_path / "home"
    if entry_icon is not None:
        entry = home / desktop_icon.ENTRY
        entry.parent.mkdir(parents=True)
        icon = str(home / desktop_icon.OLD) if entry_icon == "old-path" else entry_icon
        entry.write_text(f"[Desktop Entry]\nName=HPC Hub\nIcon={icon}\nTerminal=false\n")
    if old is not None:
        (home / desktop_icon.OLD).parent.mkdir(parents=True, exist_ok=True)
        (home / desktop_icon.OLD).write_bytes(old)
    return str(app), home


def test_an_update_puts_its_icon_in_the_theme(tmp_path):
    app, home = setup(tmp_path)
    assert desktop_icon.refresh(app, home) is True
    assert (home / desktop_icon.THEMED).read_bytes() == b"new"
    assert desktop_icon.refresh(app, home) is False, "the same icon: nothing to do"
    assert [p.name for p in (home / desktop_icon.THEMED).parent.iterdir()] == ["hpc-hub.png"]


def test_an_older_install_moves_to_the_icon_by_name(tmp_path):
    app, home = setup(tmp_path, entry_icon="old-path", old=b"old")
    assert desktop_icon.refresh(app, home) is True
    entry = (home / desktop_icon.ENTRY).read_text()
    assert "Icon=hpc-hub\n" in entry and "Name=HPC Hub" in entry
    assert (home / desktop_icon.OLD).read_bytes() == b"new"  # the old file too, for anything still pointing there
    assert (home / desktop_icon.THEMED).read_bytes() == b"new"


def test_only_for_an_install_made_by_install_sh(tmp_path):
    app, home = setup(tmp_path, entry_icon=None)
    assert desktop_icon.refresh(app, home) is False and not (home / desktop_icon.THEMED).exists()
    app, home = setup(tmp_path / "b")
    assert desktop_icon.refresh("", home) is False  # not running from an AppImage


def test_a_link_is_left_alone(tmp_path):
    app, home = setup(tmp_path)
    other = tmp_path / "someone-elses.png"
    other.write_bytes(b"theirs")
    (home / desktop_icon.THEMED).parent.mkdir(parents=True)
    (home / desktop_icon.THEMED).symlink_to(other)
    desktop_icon.refresh(app, home)
    assert other.read_bytes() == b"theirs"
