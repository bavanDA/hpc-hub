from hpc_hub.core import desktop_icon


def setup(tmp_path, menu=b"old", bundled=b"new"):
    app = tmp_path / "app"
    (app / desktop_icon.INSIDE).parent.mkdir(parents=True)
    (app / desktop_icon.INSIDE).write_bytes(bundled)
    icons = tmp_path / "home" / ".local" / "share" / "icons"
    icons.mkdir(parents=True)
    if menu is not None:
        (icons / "hpc-hub.png").write_bytes(menu)
    return str(app), tmp_path / "home", icons / "hpc-hub.png"


def test_an_update_brings_its_icon_to_the_menu(tmp_path):
    app, home, menu = setup(tmp_path)
    assert desktop_icon.refresh(app, home) is True
    assert menu.read_bytes() == b"new"
    assert desktop_icon.refresh(app, home) is False, "the same icon: nothing to do"
    assert [p.name for p in menu.parent.iterdir()] == ["hpc-hub.png"]


def test_only_where_install_sh_put_one(tmp_path):
    app, home, menu = setup(tmp_path, menu=None)
    assert desktop_icon.refresh(app, home) is False and not menu.exists()
    assert desktop_icon.refresh("", home) is False  # not running from an AppImage


def test_a_link_is_left_alone(tmp_path):
    app, home, menu = setup(tmp_path, menu=None)
    other = tmp_path / "someone-elses.png"
    other.write_bytes(b"theirs")
    menu.symlink_to(other)
    assert desktop_icon.refresh(app, home) is False and other.read_bytes() == b"theirs"
