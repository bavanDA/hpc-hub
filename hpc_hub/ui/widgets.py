"""Small shared widgets."""

from collections.abc import Callable

import threading

from gi.repository import Adw, GLib, Gtk

from .. import browser, layout
from ..agents import AGENTS

def open_uri(widget: Gtk.Widget, uri: str) -> None:
    if not browser.open_url(uri, browser.preferred):  # your chosen Chrome profile, else the system browser
        Gtk.UriLauncher.new(uri).launch(widget.get_root(), None, None, None)


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


def remember_size(paned: Gtk.Paned, key: str, default: int) -> Gtk.Paned:
    """Drag the divider to resize; the size you leave it at is used next time too."""
    global _sizes
    if _sizes is None:
        _sizes = layout.load()
    paned.set_position(_sizes.get(key, default))

    def moved(*_):
        global _pending
        if paned.get_start_child() is None or not paned.get_start_child().get_visible():
            return  # hidden panel: its position means nothing
        _sizes[key] = paned.get_position()
        if _pending:
            GLib.source_remove(_pending)
        _pending = GLib.timeout_add(600, _flush)

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


TARGETS = (("desktop", "VS Code app", "text-editor-symbolic"), ("browser", "Browser (vscode.dev)", "web-browser-symbolic"))


def vscode_button(on_open: Callable[[str], None], label: str = "VS Code") -> Adw.SplitButton:
    """Click: open with your usual choice. Arrow: pick the VS Code app or the browser."""
    box = Gtk.Box(orientation=Gtk.Orientation.VERTICAL, spacing=2, margin_top=4, margin_bottom=4,
                  margin_start=4, margin_end=4)
    pop = Gtk.Popover(child=box)
    for target, text, icon in TARGETS:
        b = Gtk.Button(child=Adw.ButtonContent(label=f"Open in {text}", icon_name=icon), css_classes=["flat"])
        b.connect("clicked", lambda *_, t=target: (pop.popdown(), on_open(t)))
        box.append(b)
    btn = Adw.SplitButton(child=Adw.ButtonContent(label=label, icon_name="text-editor-symbolic"), popover=pop,
                          tooltip_text="Open VS Code", dropdown_tooltip="App or browser")
    btn.connect("clicked", lambda *_: on_open(""))
    return btn


def agent_buttons(on_open: Callable[[str], None], labels: bool = True) -> list[Gtk.Button]:
    """One button per agent (Claude, ChatGPT, Antigravity) with its logo."""
    out = []
    for a in AGENTS:
        if labels:
            child = Gtk.Box(spacing=6)
            child.append(Gtk.Image(icon_name=a.icon))
            child.append(Gtk.Label(label=a.name))
            b = Gtk.Button(child=child, tooltip_text=f"Run {a.name} on a compute node")
        else:
            b = Gtk.Button(child=Gtk.Image(icon_name=a.icon), tooltip_text=a.name)
        b.connect("clicked", lambda *_, i=a.id: on_open(i))
        out.append(b)
    return out
