"""The Chrome profiles links may open in, and opening a link in one."""

from dataclasses import asdict

from ...core import browser, config
from ..server import method


@method("browser.profiles")
def profiles() -> dict:
    """Chrome profiles (none without Chrome) and the default from Preferences ("" is the system browser)."""
    found = browser.profiles() if browser.chrome() else []
    return {"profiles": [asdict(p) for p in found], "default": config.load_app(config.APP_FILE).browser_profile}


@method("browser.open")
def open_link(url: str, profile: str = "") -> bool:
    """Open a web link in that Chrome profile. False: it can't (no Chrome, no such profile, not http), so the UI
    uses the system browser."""
    return bool(profile) and browser.open_url(url, profile)
