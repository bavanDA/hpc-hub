"""Open links in a chosen Chrome profile (e.g. your "Uni" one), or the system browser."""

import json
import shutil
import subprocess
from dataclasses import dataclass
from pathlib import Path

CHROME_DIRS = [Path.home() / ".config" / "google-chrome", Path.home() / ".config" / "chromium"]
CHROME_BINS = ["google-chrome", "google-chrome-stable", "chromium-browser", "chromium"]
preferred = ""  # Chrome profile name for every link the app opens; "" = system browser (set by the app)


@dataclass
class Profile:
    folder: str  # "Profile 2"
    name: str  # "Uni"
    email: str = ""


def chrome() -> str:
    return next((b for b in CHROME_BINS if shutil.which(b)), "")


def profiles(config_dir: Path | None = None) -> list[Profile]:
    for d in [config_dir] if config_dir else CHROME_DIRS:
        try:
            data = json.loads((d / "Local State").read_text())
        except (OSError, ValueError):
            continue
        cache = data.get("profile", {}).get("info_cache", {})
        return sorted((Profile(k, v.get("name", k), v.get("user_name", "")) for k, v in cache.items()),
                      key=lambda p: p.name.lower())
    return []


def find(name: str, found: list[Profile] | None = None) -> Profile | None:
    """Profile by its name in Chrome (case does not matter)."""
    want = name.strip().lower()
    return next((p for p in (profiles() if found is None else found) if p.name.lower() == want), None) if want else None


def open_url(url: str, profile_name: str) -> bool:
    """True if Chrome took it; False means: use the system browser. Web links only, after "--", so a link
    from a server can never pass as a Chrome option."""
    binary, p = chrome(), find(profile_name)
    if not (binary and p and url.lower().startswith(("https://", "http://"))):
        return False
    subprocess.Popen([binary, f"--profile-directory={p.folder}", "--", url], stdin=subprocess.DEVNULL,
                     stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, start_new_session=True)
    return True
