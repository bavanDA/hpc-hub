"""Log in through the cluster's web portal in Chrome (like the GTK app's key_setup.py, e.g. SDSC Expanse with
ACCESS): once a Chrome profile is signed in there, this computer's SSH key is added through the portal and your
username is saved, so the cluster lets you in with the key. No password is stored; the cluster still asks for
its code. The UI polls keysetup.status while its dialog is open."""

import threading
import webbrowser
from dataclasses import dataclass, field
from pathlib import Path

from ...connect.ood import Portal, PortalError
from ...core import browser, config, credentials
from ..hub import hub
from ..server import method

KEYS = ["id_ed25519.pub", "id_ecdsa.pub", "id_rsa.pub"]
POLL = 3.0  # seconds between looks at the Chrome profiles


def public_key() -> str:
    for name in KEYS:
        f = Path.home() / ".ssh" / name
        if f.exists():
            return f.read_text().strip()
    return ""


@dataclass
class Job:
    state: str = "waiting"  # waiting (for you to sign in), working, done, failed, stopped
    title: str = "Sign in to the portal in Chrome"
    text: str = "Any Chrome profile works. Use ACCESS and your saved logins; the app does the rest by itself."
    user: str = ""
    stop: threading.Event = field(default_factory=threading.Event)

    def say(self, state: str, title: str, text: str = "", user: str = "") -> None:
        if not self.stop.is_set() or state == "stopped":
            self.state, self.title, self.text, self.user = state, title, text, user

    def json(self) -> dict:
        return {"state": self.state, "title": self.title, "text": self.text, "user": self.user}


_jobs: dict[str, Job] = {}
_lock = threading.Lock()


def _portal(cluster: str) -> str:
    cfg = hub().session(cluster).cfg
    if not cfg.portal.startswith("https://"):
        raise ValueError(f"{cfg.name} has no web portal to add your key through")
    return cfg.portal


def _open(url: str, profile: str = "") -> None:
    """In that Chrome profile, else the app's usual one, else the system browser."""
    if not browser.open_url(url, profile or config.load_app().browser_profile):
        webbrowser.open(url)


def _signed_in(portals: list[Portal]) -> tuple[Portal | None, str, str, str]:
    """The first Chrome profile signed in to the portal: (portal, user, home, csrf)."""
    for portal in portals:
        user, home, csrf = portal.signed_in()
        if user:
            return portal, user, home, csrf
    return None, "", "", ""


def _work(job: Job, cluster: str, url: str) -> None:
    key = public_key()
    if not key:
        job.say("failed", "No SSH key on this computer", "Make one in a terminal with: ssh-keygen -t ed25519")
        return
    try:
        portals = [Portal(url, p.name) for p in browser.profiles()]
        if not portals:
            job.say("failed", "No Chrome profiles found", "Install Google Chrome and sign in to the portal there.")
            return
        opened = False
        while not job.stop.is_set():
            portal, user, home, csrf = _signed_in(portals)
            if portal:
                break
            if not opened and not job.stop.is_set():  # signed in from before? then Chrome never opens
                _open(url)
                opened = True
            job.stop.wait(POLL)
        else:
            return
        job.say("working", f"Signed in as {user}", "Adding this computer's key to your account…")
        added = portal.add_key(home, csrf, key)
    except (PortalError, OSError, ValueError) as e:
        job.say("failed", "Could not finish", str(e))
        return
    if job.stop.is_set():
        return
    saved = credentials.load(cluster, credentials.SSH)
    password = saved.password if saved and saved.username == user else ""  # a key login needs none
    credentials.save(cluster, credentials.SSH, credentials.Login(user, password))
    job.say("done", f"Signed in as {user}", "Key added. Connecting…" if added else
            "Your key was on the cluster already. Connecting…", user)


@method("keysetup.start")
def start(cluster: str) -> dict:
    """Start (or keep) waiting for a Chrome profile signed in to the portal; answers the status."""
    url = _portal(cluster)
    with _lock:
        job = _jobs.get(cluster)
        if job and job.state in ("waiting", "working"):
            return job.json()
        job = _jobs[cluster] = Job()
    threading.Thread(target=_work, args=(job, cluster, url), daemon=True).start()
    return job.json()


@method("keysetup.status")
def status(cluster: str) -> dict:
    job = _jobs.get(cluster)
    return job.json() if job else Job(state="stopped", title="", text="").json()


@method("keysetup.open")
def open_portal(cluster: str, profile: str = "") -> None:
    """Open the portal again, in a Chrome profile you pick ("" = the usual browser)."""
    if profile and not browser.find(profile):
        raise ValueError(f"No Chrome profile named {profile}")
    _open(_portal(cluster), profile)


@method("keysetup.profiles")
def profiles() -> list[str]:
    """The Chrome profiles the portal can be opened in."""
    return [p.name for p in browser.profiles()] if browser.chrome() else []


@method("keysetup.stop")
def stop(cluster: str) -> None:
    job = _jobs.get(cluster)
    if job:
        job.stop.set()
        if job.state in ("waiting", "working"):
            job.say("stopped", "Stopped")
