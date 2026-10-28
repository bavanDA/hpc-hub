"""Small shared widgets."""

import threading
from collections.abc import Callable

from gi.repository import Adw, Gdk, GLib, Gtk

from ..agents.catalog import AGENTS
from ..core import browser, layout


def profile_choices(fixed: list[tuple[str, str, str]], found: list[browser.Profile], default: str
                    ) -> tuple[Gtk.ListBox, Callable[[], str]]:
    """Radio list: the fixed (value, title, subtitle) rows, then one per Chrome profile; default is picked and
    marked. Returns the list and a function giving the picked value (a profile name, or a fixed value)."""
    options = Gtk.ListBox(css_classes=["boxed-list"], selection_mode=Gtk.SelectionMode.NONE)
    checks: list[tuple[str, Gtk.CheckButton]] = []
    for name, title, subtitle in fixed + [(p.name, f"Chrome: {p.name}", p.email) for p in found]:
        is_default = name.lower() == default.lower()
        check = Gtk.CheckButton(valign=Gtk.Align.CENTER, active=is_default, group=checks[0][1] if checks else None)
        row = Adw.ActionRow(title=title, subtitle=subtitle, activatable_widget=check)
        row.add_prefix(check)
        if is_default:
            row.add_suffix(Gtk.Label(label="Default", css_classes=["dim-label"]))
        options.append(row)
        checks.append((name, check))
    if not any(c.get_active() for _, c in checks):
        checks[0][1].set_active(True)
    return options, lambda: next(n for n, c in checks if c.get_active())


def open_uri(widget: Gtk.Widget, uri: str) -> None:
    """Ask which Chrome profile opens it (your default picked), or the system browser."""
    found = browser.profiles() if browser.chrome() else []
    root = widget.get_root()

    def launch(profile: str) -> None:
        if not (profile and browser.open_url(uri, profile)):
            Gtk.UriLauncher.new(uri).launch(root, None, None, None)
    if not found:
        launch("")
        return
    options, picked = profile_choices([("", "System browser", "")], found, browser.preferred)
    d = Adw.AlertDialog(heading="Open link", body=uri if len(uri) < 90 else uri[:87] + "…")
    d.set_extra_child(options)
    d.add_response("cancel", "Cancel")
    d.add_response("copy", "Copy link")
    d.add_response("open", "Open")
    d.set_response_appearance("open", Adw.ResponseAppearance.SUGGESTED)
    d.set_default_response("open")
    d.set_close_response("cancel")

    def on_response(_d, r):
        if r == "open":
            launch(picked())
        elif r == "copy":
            Gdk.Display.get_default().get_clipboard().set(uri)
    d.connect("response", on_response)
    d.present(root)


def ask_name(parent: Gtk.Widget, heading: str, confirm: str, then: Callable[[str], None], text: str = "",
             body: str = "", allow_slash: bool = False) -> None:
    """Ask for a name; then(name) gets a non-empty one (without "/" unless allowed)."""
    d = Adw.AlertDialog(heading=heading, body=body)
    entry = Gtk.Entry(text=text, activates_default=True)
    d.set_extra_child(entry)
    d.add_response("cancel", "Cancel")
    d.add_response("ok", confirm)
    d.set_response_appearance("ok", Adw.ResponseAppearance.SUGGESTED)
    d.set_default_response("ok")

    def on_response(_d, r):
        name = entry.get_text().strip()
        if r == "ok" and name and (allow_slash or "/" not in name):
            then(name)
    d.connect("response", on_response)
    d.present(parent)


def shortcuts(widget: Gtk.Widget, *keys: tuple[str, Callable[[], object]]) -> None:
    """Keyboard shortcuts while widget is shown, e.g. ("<Control>s", save)."""
    ctl = Gtk.ShortcutController(scope=Gtk.ShortcutScope.MANAGED)
    for trigger, fn in keys:
        ctl.add_shortcut(Gtk.Shortcut(trigger=Gtk.ShortcutTrigger.parse_string(trigger),
                                      action=Gtk.CallbackAction.new(lambda *_, f=fn: f() or True)))
    widget.add_controller(ctl)


def bg(work: Callable[[], object], done: Callable[[object, str], None]) -> None:
    """Run work() on a thread, then done(result, error) on the main loop."""
    def run():
        try:
            result, err = work(), ""
        except Exception as e:  # noqa: BLE001
            result, err = None, str(e)
        GLib.idle_add(lambda: done(result, err) and False)
    threading.Thread(target=run, daemon=True).start()


_sizes: dict[str, int] | None = None
_pending = 0


def remembered(key: str, default: int) -> int:
    """A small number kept between runs (panel sizes, which view you picked)."""
    global _sizes
    if _sizes is None:
        _sizes = layout.load()
    return _sizes.get(key, default)


def remember(key: str, value: int) -> None:
    global _pending
    remembered(key, value)
    _sizes[key] = int(value)
    if _pending:
        GLib.source_remove(_pending)
    _pending = GLib.timeout_add(600, _flush)


def remember_size(paned: Gtk.Paned, key: str, default: int) -> Gtk.Paned:
    """Drag the divider to resize; the size you leave it at is used next time too."""
    paned.set_position(remembered(key, default))

    def moved(*_):
        if paned.get_start_child() is None or not paned.get_start_child().get_visible():
            return  # hidden panel: its position means nothing
        remember(key, paned.get_position())

    paned.connect("notify::position", moved)
    return paned


def _flush() -> bool:
    global _pending
    _pending = 0
    try:
        layout.save(_sizes or {})
    except OSError:
        pass
    return False


TARGETS = (("desktop", "VS Code app", "text-editor-symbolic"),
           ("browser", "Browser (vscode.dev)", "web-browser-symbolic"))


def open_menu(on_open: Callable[[str], None], extra: tuple[tuple[str, str, str], ...] = ()) -> Gtk.MenuButton:
    """One Open button: VS Code (app or browser) and Files; Ask all agents and each agent; then extra
    (id, label, icon). Keys: vscode:<target>, files, ask, agent:<id>, or an extra's id."""
    box = Gtk.Box(orientation=Gtk.Orientation.VERTICAL, spacing=2, margin_top=4, margin_bottom=4,
                  margin_start=4, margin_end=4)
    pop = Gtk.Popover(child=box)
    vscode = {"desktop": "VS Code app", "browser": "VS Code in browser"}
    groups = [[(f"vscode:{t}", vscode.get(t, text), icon) for t, text, icon in TARGETS]
              + [("files", "Files", "folder-symbolic")],
              [("ask", "Ask all agents", "system-users-symbolic")]
              + [(f"agent:{a.id}", a.name, a.icon) for a in AGENTS],
              list(extra)]
    for n, group in enumerate(g for g in groups if g):
        if n:
            box.append(Gtk.Separator(margin_top=2, margin_bottom=2))
        for key, text, icon in group:
            b = Gtk.Button(child=Adw.ButtonContent(label=text, icon_name=icon, halign=Gtk.Align.START),
                           css_classes=["flat"])
            b.connect("clicked", lambda *_, k=key: (pop.popdown(), on_open(k)))
            box.append(b)
    return Gtk.MenuButton(child=Adw.ButtonContent(label="Open", icon_name="view-app-grid-symbolic"), popover=pop,
                          always_show_arrow=True, tooltip_text="VS Code, Claude and more")


def color_dot(color: str, size: int = 12) -> Gtk.DrawingArea:
    rgba = Gdk.RGBA()
    rgba.parse(color or "#77767b")

    def draw(_a, cr, w, h):
        cr.set_source_rgba(rgba.red, rgba.green, rgba.blue, rgba.alpha)
        cr.arc(w / 2, h / 2, min(w, h) / 2, 0, 6.2832)
        cr.fill()
    area = Gtk.DrawingArea(content_width=size, content_height=size, valign=Gtk.Align.CENTER)
    area.set_draw_func(draw)
    return area
