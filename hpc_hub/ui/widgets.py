"""Small shared widgets."""

from collections.abc import Callable

from gi.repository import Adw, Gtk

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
