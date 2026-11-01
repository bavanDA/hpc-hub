"""Log in through the cluster's web portal (like the GTK app's key_setup.py, e.g. SDSC Expanse with ACCESS): you
sign in in a window HPC Hub controls (our Chrome window where there is one, else the app's sign-in window, which
the UI opens for the "web-login" question), then this computer's SSH key is added through the portal and your
username is saved, so the cluster lets you in with the key. Your own browser is never touched. No password is
stored; the cluster still asks for its code. The UI polls keysetup.status while its dialog is open."""

import threading
from dataclasses import dataclass, field
from pathlib import Path

from ...connect import chrome_window
from ...connect.ood import PortalError, add_key_signed_in
from ...core import credentials
from ..hub import hub
from ..server import method

KEYS = ["id_ed25519.pub", "id_ecdsa.pub", "id_rsa.pub"]
NOTE = "Sign in there as you would on the website. HPC Hub keeps only the sign-in, never your password."


def public_key() -> str:
    for name in KEYS:
        f = Path.home() / ".ssh" / name
        if f.exists():
            return f.read_text().strip()
    return ""


@dataclass
class Job:
    state: str = "waiting"  # waiting (for you to sign in), working, done, failed, stopped
    title: str = "Sign in to the portal"
    text: str = "Sign in in the window that opened. The app does the rest by itself."
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


def _work(job: Job, cluster: str, url: str) -> None:
    key = public_key()
    if not key:
        job.say("failed", "No SSH key on this computer", "Make one in a terminal with: ssh-keygen -t ed25519")
        return
    s = hub().session(cluster)
    where = chrome_window.CHOICE if chrome_window.available() else ""

    def sign_in(start) -> tuple[str, str]:
        if job.stop.is_set():
            return "", "Stopped"
        return hub().web_login(s, start, credentials.Login("", ""), where, f"{s.cfg.name} portal sign-in", NOTE)

    def signed_in(user: str) -> None:
        job.say("working", f"Signed in as {user}", "Adding this computer's key to your account…")

    try:
        user, added = add_key_signed_in(url, sign_in, key, signed_in)
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
    """Start (or keep) the portal sign-in; answers the status."""
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


@method("keysetup.stop")
def stop(cluster: str) -> None:
    job = _jobs.get(cluster)
    if job:
        job.stop.set()
        if job.state in ("waiting", "working"):
            job.say("stopped", "Stopped")
