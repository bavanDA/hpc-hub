"""Preferences: the default browser for links and the experimental pages, kept in app.toml."""

import threading

from ...core import browser, config, features
from ..server import method

_lock = threading.Lock()  # one load, change, save at a time


def _json(app: config.AppSettings) -> dict:
    return {"browser_profile": app.browser_profile, "experimental": app.experimental,
            "select_to_copy": app.select_to_copy}


@method("preferences.get")
def get() -> dict:
    return _json(config.load_app(config.APP_FILE))


@method("preferences.set")
def set_(browser_profile: str | None = None, experimental: bool | None = None,
         select_to_copy: bool | None = None) -> dict:
    """Change what is given and save; returns all preferences."""
    with _lock:
        app = config.load_app(config.APP_FILE)
        if browser_profile is not None:
            app.browser_profile = browser.preferred = browser_profile.strip()
        if experimental is not None:
            app.experimental = features.experimental = bool(experimental)
        if select_to_copy is not None:
            app.select_to_copy = features.select_to_copy = bool(select_to_copy)
        config.save_app(app, config.APP_FILE)
        return _json(app)
