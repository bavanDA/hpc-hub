"""Preferences kept in app.toml: appearance, the browser for links, terminal settings, experimental pages."""

import threading

from ...core import config
from ..server import method

_lock = threading.Lock()  # one load, change, save at a time


def _json(app: config.AppSettings) -> dict:
    return {"browser_profile": app.browser_profile, **{k: getattr(app, k) for k in config.EXPERIMENTS},
            "select_to_copy": app.select_to_copy, "monitor_bar": app.monitor_bar, "appearance": app.appearance}


@method("preferences.get")
def get() -> dict:
    return _json(config.load_app(config.APP_FILE))


@method("preferences.set")
def set_(browser_profile: str | None = None, experimental_papers: bool | None = None,
         experimental_skills: bool | None = None, experimental_schedules: bool | None = None,
         select_to_copy: bool | None = None, monitor_bar: bool | None = None,
         appearance: str | None = None) -> dict:
    """Change what is given and save; returns all preferences."""
    with _lock:
        app = config.load_app(config.APP_FILE)
        if browser_profile is not None:
            app.browser_profile = browser_profile.strip()
        for key, on in (("experimental_papers", experimental_papers), ("experimental_skills", experimental_skills),
                        ("experimental_schedules", experimental_schedules)):
            if on is not None:
                setattr(app, key, bool(on))
        if select_to_copy is not None:
            app.select_to_copy = bool(select_to_copy)
        if monitor_bar is not None:
            app.monitor_bar = bool(monitor_bar)
        if appearance is not None:
            if appearance not in config.APPEARANCES:
                raise ValueError(f"Appearance is one of {', '.join(config.APPEARANCES)}")
            app.appearance = appearance
        config.save_app(app, config.APP_FILE)
        return _json(app)
