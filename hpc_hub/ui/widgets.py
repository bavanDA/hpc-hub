"""Small shared widgets."""

from collections.abc import Callable

from gi.repository import Adw, Gtk

from ..agents import AGENTS

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
