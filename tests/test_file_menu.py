import gi

gi.require_version("Gtk", "4.0")
gi.require_version("Adw", "1")

from hpc_hub.remote_fs import Entry  # noqa: E402
from hpc_hub.ui.files import menu as file_menu  # noqa: E402


def labels(menu):
    out = []
    for i in range(menu.get_n_items()):
        section = menu.get_item_link(i, "section")
        for j in range(section.get_n_items()):
            out.append(section.get_item_attribute_value(j, "label").get_string())
    return out


def test_menus():
    folder = labels(file_menu.build(Entry("myproject", "d", 0, 0), False, (".tex",)))
    assert folder[:2] == ["Open", "Open in VS Code"] and "Make a zip" in folder and folder[-1] == "Delete…"
    tex = labels(file_menu.build(Entry("main.tex", "f", 10, 0), False, (".tex",)))
    assert tex[:3] == ["Open", "Edit", "Open in LaTeX"] and "Open its folder in VS Code" in tex
    assert "Extract here" in labels(file_menu.build(Entry("data.tar.gz", "f", 10, 0), False, ()))
    here = labels(file_menu.build(None, True, ()))
    assert "Paste here" in here and "Open this folder in VS Code" in here and "Delete…" not in here
