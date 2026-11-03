"""Settings, Appearance: light, dark, or what the computer uses, for every window (libadwaita's style manager)."""

from gi.repository import Adw, Gtk

CHOICES = [("system", "System", "computer-symbolic"), ("light", "Light", "weather-clear-symbolic"),
           ("dark", "Dark", "weather-clear-night-symbolic")]
SCHEMES = {"system": Adw.ColorScheme.DEFAULT, "light": Adw.ColorScheme.FORCE_LIGHT,
           "dark": Adw.ColorScheme.FORCE_DARK, "blue": Adw.ColorScheme.FORCE_DARK}


def apply(appearance: str) -> None:
    Adw.StyleManager.get_default().set_color_scheme(SCHEMES.get(appearance, Adw.ColorScheme.DEFAULT))


def row(current: str, on_change) -> Adw.ActionRow:
    """A "Theme" row with System, Light and Dark side by side; on_change(appearance) after it is applied."""
    group = Adw.ToggleGroup(valign=Gtk.Align.CENTER)
    for name, label, icon in CHOICES:
        group.add(Adw.Toggle(name=name, label=label, icon_name=icon))
    group.set_active_name(current if current in SCHEMES else "system")

    def changed(*_):
        name = group.get_active_name() or "system"
        apply(name)
        on_change(name)
    group.connect("notify::active-name", changed)
    r = Adw.ActionRow(title="Theme")
    r.add_suffix(group)
    return r
