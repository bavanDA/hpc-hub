"""App preferences: which browser opens links."""

from collections.abc import Callable

from gi.repository import Adw, GLib, Gtk

from ..core import browser
from ..core.config import AppSettings


class PreferencesDialog(Adw.PreferencesDialog):
    def __init__(self, app: AppSettings, save: Callable[[], None]):
        super().__init__(title="Preferences", search_enabled=False)
        self.app, self.save = app, save
        self.found = browser.profiles() if browser.chrome() else []
        page = Adw.PreferencesPage()
        group = Adw.PreferencesGroup(
            title="Links", description="Every link asks which browser opens it. This one is picked for you.")
        labels = ["System browser"] + [f"Chrome: {p.name}" + (f" ({p.email})" if p.email else "") for p in self.found]
        self.row = Adw.ComboRow(title="Default for links", model=Gtk.StringList.new(labels))
        names = [p.name.lower() for p in self.found]
        cur = app.browser_profile.lower()
        self.row.set_selected(names.index(cur) + 1 if cur in names else 0)
        self.row.connect("notify::selected", lambda *_: self._changed())
        group.add(self.row)
        if not self.found:
            group.add(Adw.ActionRow(title="No Chrome profiles found", subtitle=GLib.markup_escape_text(
                "Install Google Chrome to pick a profile.")))
        page.add(group)
        self.add(page)

    def _changed(self) -> None:
        i = self.row.get_selected()
        self.app.browser_profile = self.found[i - 1].name if i > 0 else ""
        browser.preferred = self.app.browser_profile
        self.save()
