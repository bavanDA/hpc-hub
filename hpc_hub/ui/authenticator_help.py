"""How to set up Google Authenticator for a cluster that asks for a 6-digit code (e.g. SDSC Expanse)."""

from urllib.parse import urlsplit

from gi.repository import Adw, Gtk

from ..config import ClusterConfig
from .widgets import open_uri


def _step(n: int, title: str, subtitle: str) -> Adw.ActionRow:
    row = Adw.ActionRow(title=title, subtitle=subtitle, subtitle_lines=0)
    row.add_prefix(Gtk.Label(label=str(n), css_classes=["title-3", "accent"], width_chars=2))
    return row


class AuthenticatorHelp(Adw.Dialog):
    def __init__(self, cfg: ClusterConfig):
        super().__init__(title="Google Authenticator", content_width=520, content_height=640)
        url = cfg.code_setup
        site = urlsplit(url).hostname or url
        sign_in = ("Choose Log In Using Globus, then ACCESS CI, and sign in with your ACCESS login"
                   if "sdsc.edu" in site else f"Sign in with the account you use for {cfg.name}")
        page = Adw.PreferencesPage()

        steps = Adw.PreferencesGroup(title=f"Set up codes for {cfg.name}",
                                     description=f"{cfg.name} asks for a 6-digit code from your phone at every "
                                                 "login. You set this up once.")
        rows = [
            ("Install Google Authenticator on your phone",
             "From the App Store or Google Play. Microsoft Authenticator or Authy work too."),
            (f"Open {site}" if url else "Open your cluster's account page", sign_in),
            ("Click Manage 2FA and scan the QR code",
             "In Google Authenticator: tap +, then Scan a QR code. A new entry shows a code that changes every "
             "30 seconds."),
            ("Wait up to 15 minutes", f"{cfg.name} takes a while to learn your new code."),
            ("Connect in HPC Hub",
             f"When it asks, type the code shown for {cfg.name}. It is sent as soon as you type 6 digits."),
        ]
        for n, (title, subtitle) in enumerate(rows, 1):
            steps.add(_step(n, title, subtitle))
        page.add(steps)

        if url:
            go = Adw.PreferencesGroup()
            row = Adw.ButtonRow(title=f"Open {site}", start_icon_name="web-browser-symbolic")
            row.add_css_class("suggested-action")
            row.connect("activated", lambda *_: open_uri(self, url))
            go.add(row)
            page.add(go)

        tips = Adw.PreferencesGroup(title="If a code is refused")
        for title, subtitle in (
            ("Wait for a fresh code", "Codes last 30 seconds. Type one that just appeared."),
            ("Check your phone's clock", "Date and time must be set automatically, or every code is wrong."),
            ("Don't guess", f"{cfg.name} may lock the account after a few wrong codes."),
            ("It never asks for a code", "Then no authenticator is set up yet, or the 15 minutes are not over."),
        ):
            tips.add(Adw.ActionRow(title=title, subtitle=subtitle, subtitle_lines=0))
        page.add(tips)

        tv = Adw.ToolbarView(content=page)
        tv.add_top_bar(Adw.HeaderBar())
        self.set_child(tv)
