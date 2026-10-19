"""Right-click menu in Files: open, edit, VS Code, Claude, zip, rename, delete, and the rest."""

from gi.repository import Gdk, Gio, Gtk

from .. import remote_fs
from ..remote_fs import Entry


def build(entry: Entry | None, can_paste: bool, text_ext: tuple[str, ...]) -> Gio.Menu:
    """Menu for a file or folder, or (entry None) for the folder you are in."""
    menu = Gio.Menu()
    first, tools, manage, danger = Gio.Menu(), Gio.Menu(), Gio.Menu(), Gio.Menu()
    if entry is None:
        first.append("New folder…", "file.new-folder")
        first.append("Upload files here…", "file.upload")
        if can_paste:
            first.append("Paste here", "file.paste")
        tools.append("Open this folder in VS Code", "file.vscode")
        tools.append("Claude in this folder", "file.claude")
        tools.append("Copy path", "file.copy-path")
    else:
        first.append("Open", "file.open")
        if not entry.is_dir and remote_fs.ext(entry.name) in text_ext:
            first.append("Edit", "file.edit")
        if entry.name.lower().endswith(".tex"):
            first.append("Open in LaTeX", "file.latex")
        tools.append("Open in VS Code" if entry.is_dir else "Open its folder in VS Code", "file.vscode")
        tools.append("Claude here" if entry.is_dir else "Claude in its folder", "file.claude")
        tools.append("Copy path", "file.copy-path")
        manage.append("Download", "file.download")
        manage.append("Rename…", "file.rename")
        manage.append("Extract here" if remote_fs.ext(entry.name) in remote_fs.ARCHIVES else "Make a zip", "file.zip")
        manage.append("Copy to another cluster", "file.copy")
        danger.append("Delete…", "file.delete")
    for section in (first, tools, manage, danger):
        if section.get_n_items():
            menu.append_section(None, section)
    return menu


def install(pane) -> None:
    """Right click on a row (or on empty space) in a FilePane opens the menu."""
    group = Gio.SimpleActionGroup()

    def add(name, fn):
        act = Gio.SimpleAction(name=name)
        act.connect("activate", lambda *_: fn())
        group.add_action(act)

    target = {"entry": None}

    def entry():
        return target["entry"]

    def folder() -> str:
        e = entry()
        return pane.child(e) if e and e.is_dir else pane.path

    def copy_path():
        path = pane.child(entry()) if entry() else pane.path
        pane.get_clipboard().set(path)
        pane.toast(f"Copied {path}")

    add("open", lambda: pane.open_entry(entry()))
    add("edit", lambda: pane.edit(entry()))
    add("latex", lambda: pane.on_latex(pane.session, pane.child(entry())))
    add("vscode", lambda: pane.on_tool and pane.on_tool(pane.session, "vscode", folder()))
    add("claude", lambda: pane.on_tool and pane.on_tool(pane.session, "agent:claude", folder()))
    add("copy-path", copy_path)
    add("download", lambda: pane.download(entry()))
    add("rename", lambda: pane.rename(entry()))
    add("zip", lambda: pane.zip_or_extract(entry()))
    add("copy", lambda: pane.on_copy(pane, entry()))
    add("delete", lambda: pane.delete(entry()))
    add("new-folder", pane.new_folder)
    add("upload", pane.upload)
    add("paste", lambda: pane.on_paste and pane.on_paste())
    pane.insert_action_group("file", group)

    popover = Gtk.PopoverMenu(has_arrow=False, halign=Gtk.Align.START)
    popover.set_parent(pane.view)

    def pressed(gesture, _n, x, y):
        gesture.set_state(Gtk.EventSequenceState.CLAIMED)
        pos = _row_at(pane.view, x, y)
        e = None
        if pos is not None:
            pane.selection.set_selected(pos)
            e = pane.store.get_item(pos).entry
        target["entry"] = e
        popover.set_menu_model(build(e, bool(pane.can_paste and pane.can_paste()), pane.text_ext))
        rect = Gdk.Rectangle()
        rect.x, rect.y, rect.width, rect.height = int(x), int(y), 1, 1
        popover.set_pointing_to(rect)
        popover.popup()

    click = Gtk.GestureClick(button=3)
    click.connect("pressed", pressed)
    pane.view.add_controller(click)


def _row_at(view: Gtk.Widget, x: float, y: float) -> int | None:
    """The list position under the pointer. Cells carry it as `row_pos` (set when bound); a click on a
    cell's padding lands on the cell or row widget, so look one or two levels down as well."""
    w = view.pick(x, y, Gtk.PickFlags.DEFAULT)
    while w is not None and w is not view:
        child = w.get_first_child()
        for c in (w, child, child.get_first_child() if child else None):
            pos = getattr(c, "row_pos", None) if c is not None else None
            if pos is not None:
                return pos
        w = w.get_parent()
    return None
