"""App preferences: which browser opens links, select to copy in terminals, and experimental features."""

from collections.abc import Callable

from gi.repository import Adw, GLib, Gtk

from ..core import browser, features
from ..core.config import AppSettings


class PreferencesDialog(Adw.PreferencesDialog):
    def __init__(self, app: AppSettings, save: Callable[[], None],
                 on_experimental: Callable[[bool], None] = lambda on: None):
        super().__init__(title="Preferences", search_enabled=False)
        self.app, self.save, self.on_experimental = app, save, on_experimental
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

        terms = Adw.PreferencesGroup(title="Terminals")
        self.select = Adw.SwitchRow(title="Select to copy", active=app.select_to_copy,
                                    subtitle="Highlight text with the mouse to copy it.")
        self.select.connect("notify::active", lambda *_: self._select())
        terms.add(self.select)
        page.add(terms)

        trial = Adw.PreferencesGroup(title="Experimental")
        self.experimental = Adw.SwitchRow(title="Experimental features", active=app.experimental,
                                          subtitle="LaTeX, Skills and Scheduled agents. They may change or break.")
        self.experimental.connect("notify::active", lambda *_: self._experimental())
        trial.add(self.experimental)
        page.add(trial)
        self.add(page)

    def _experimental(self) -> None:
        on = self.experimental.get_active()
        self.app.experimental = features.experimental = on
        self.save()
        self.on_experimental(on)

    def _select(self) -> None:
        self.app.select_to_copy = features.select_to_copy = self.select.get_active()
        self.save()

    def _changed(self) -> None:
        i = self.row.get_selected()
        self.app.browser_profile = self.found[i - 1].name if i > 0 else ""
        browser.preferred = self.app.browser_profile
        self.save()
