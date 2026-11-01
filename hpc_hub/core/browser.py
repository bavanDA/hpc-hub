"""Open links in a chosen Chrome profile (e.g. your "Uni" one), or the system browser."""

import json
import os
import shutil
import subprocess
import sys
from dataclasses import dataclass
from pathlib import Path

CHROME_BINS = ["google-chrome", "google-chrome-stable", "chromium-browser", "chromium"]  # Linux, on PATH
MAC_APPS = ["Google Chrome.app/Contents/MacOS/Google Chrome", "Chromium.app/Contents/MacOS/Chromium"]
WINDOWS_EXE = r"Google\Chrome\Application\chrome.exe"
preferred = ""  # Chrome profile name for every link the app opens; "" = system browser (set by the app)


@dataclass
class Profile:
    folder: str  # "Profile 2"
    name: str  # "Uni"
    email: str = ""


def chrome_dirs(platform: str = sys.platform, env=os.environ, home: Path | None = None) -> list[Path]:
    """Where Chrome keeps its profiles (for their names, to open links in one)."""
    home = home or Path.home()
    if platform == "darwin":
        base = home / "Library" / "Application Support"
        return [base / "Google" / "Chrome", base / "Chromium"]
    if platform == "win32":
        local = Path(env.get("LOCALAPPDATA") or home / "AppData" / "Local")
        return [local / "Google" / "Chrome" / "User Data", local / "Chromium" / "User Data"]
    return [home / ".config" / "google-chrome", home / ".config" / "chromium"]


CHROME_DIRS = chrome_dirs()


def chrome_candidates(platform: str = sys.platform, env=os.environ, home: Path | None = None) -> list[str]:
    """Full paths where Chrome is installed on macOS and Windows; on Linux, names looked up on PATH."""
    home = home or Path.home()
    if platform == "darwin":
        return [str(d / app) for d in (Path("/Applications"), home / "Applications") for app in MAC_APPS]
    if platform == "win32":
        roots = [env.get(v) for v in ("ProgramFiles", "ProgramFiles(x86)", "LOCALAPPDATA")]
        return [str(Path(r) / WINDOWS_EXE) for r in roots if r]
    return CHROME_BINS


def chrome() -> str:
    """Chrome's program (a full path, or a name on PATH), or "" if it isn't installed."""
    for c in chrome_candidates():
        if os.path.isabs(c) and os.path.isfile(c) or not os.path.isabs(c) and shutil.which(c):
            return c
    return ""


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
