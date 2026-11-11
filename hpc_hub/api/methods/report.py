"""Bug reports. report.preview gathers the error, its traceback and the recent log, scrubbed (core/scrub.py), and the
review window shows that; report.send posts what was shown to the report server. Nothing leaves before Send, and
the backend sends it because the webview can't post to another site."""

import getpass
import json
import platform
import socket
import sys
import time
import urllib.error
import urllib.request
from dataclasses import asdict
from pathlib import Path

from ... import __version__
from ...core import config, credentials, scrub
from ...projects import store
from .. import recent
from ..server import method

URL = "https://hpchub.staylazy.app/report"
TIMEOUT = 20
KINDS = ("error", "user")
LIMITS = {"text": 4000, "error": 8000, "log": 20000, "page": 100, "app": 40, "platform": 40, "os": 80,
          "contact": 200}
SHOT_PREFIX = "data:image/png;base64,"
SHOT_BYTES = 2_500_000  # decoded
LOG_LINES = 120  # of the cluster the error is about
OTHER_LOG_LINES = 30  # of each cluster, for an error that is about none
KNOWN_SECONDS = 60  # the keyring is read once a minute at most, not on every key typed in the note

_known: tuple[float, scrub.Known] | None = None


def _accounts(c: config.ClusterConfig) -> set[str]:
    profiles = [c.profile, c.vscode.compute, *(a.compute for a in (c.claude, c.codex, c.agy, c.cursor))]
    out = {p.account for p in profiles}
    for p in profiles:  # --account=x or -A x in the extra sbatch options
        words = p.extra_args.replace("=", " ").split()
        out |= {b for a, b in zip(words, words[1:]) if a in ("--account", "-A")}
    return {a.strip() for a in out if a.strip()}


def _strings(value) -> list[str]:
    if isinstance(value, dict):
        return [s for v in value.values() for s in _strings(v)]
    return [value] if isinstance(value, str) else []


def _groups(texts: list[str], users: set[str]) -> set[str]:
    """Group folders in paths: /project/<group>/<you>, Yale's ~/project_<group> (projects/store.py group_of)."""
    out = set()
    for text in texts:
        for word in text.replace("=", " ").replace(":", " ").split():
            if "/" in word:
                out |= {store.group_of(word, u) for u in users or {""}}
    return {g for g in out if g}


def known() -> scrub.Known:
    """What to hide: saved logins, accounts and groups of every cluster, this computer's user, home and name."""
    global _known
    if _known and time.monotonic() - _known[0] < KNOWN_SECONDS:
        return _known[1]
    k = scrub.Known(homes={str(Path.home())})
    try:
        k.users.add(getpass.getuser())
    except (OSError, KeyError):  # no user name for this uid
        pass
    host = socket.gethostname().split(".")[0]
    if host.lower() not in ("", "localhost"):
        k.hosts.add(host)
    try:
        clusters = config.load()
    except (OSError, ValueError):  # a broken clusters.toml: the default clusters say nothing personal
        clusters = []
    texts = []
    for c in clusters:
        for kind in (credentials.SSH, credentials.VPN):
            try:
                login = credentials.load(c.id, kind)
            except Exception:  # noqa: BLE001 - a locked or missing keyring: that login stays unknown
                login = None
            if login and login.username:
                k.users |= {login.username, login.username.partition("@")[0]}  # jdoe@example.edu: jdoe too
            if login and login.password:
                k.secrets.add(login.password)
        k.accounts |= _accounts(c)
        texts += _strings(asdict(c))
    try:
        from ..hub import hub
        k.secrets |= set(hub().__dict__.get("passwords", {}).values())  # typed for "don't remember" clusters
    except RuntimeError:  # no hub (tests, a script)
        pass
    try:
        texts += [p.path for p in store.load()]
    except (OSError, ValueError):
        pass
    k.groups = _groups(texts, k.users) - k.accounts
    _known = (time.monotonic(), k)
    return k


def _platform() -> str:
    return {"win32": "windows", "darwin": "macos", "android": "android"}.get(sys.platform, "linux")


def _os() -> str:
    if sys.platform == "android":
        ver = getattr(platform, "android_ver", lambda: None)()
        return f"Android {ver.release}" if ver else "Android"
    if sys.platform == "darwin":
        return f"macOS {platform.mac_ver()[0]}"
    if sys.platform == "win32":
        return f"Windows {platform.release()} ({platform.version()})"
    try:
        info = platform.freedesktop_os_release()
        name = info.get("PRETTY_NAME") or f"{info.get('NAME', 'Linux')} {info.get('VERSION_ID', '')}".strip()
    except OSError:
        name = "Linux"
    return f"{name}, kernel {platform.release()}"


def _cut(text: str, limit: int, keep: str = "start") -> str:
    """At most limit characters: a log keeps its end, an error its start and end (the message and where it broke)."""
    if len(text) <= limit:
        return text
    if keep == "end":
        return "…\n" + text[-(limit - 2):]
    if keep == "both":
        head = limit // 4
        return text[:head] + "\n…\n" + text[-(limit - head - 3):]
    return text[:limit - 1] + "…"


def _clock(at: float) -> str:
    return time.strftime("%H:%M:%S", time.localtime(at))


def _error(error: str, ref) -> str:
    out = error.strip()
    failed = recent.find(ref) if isinstance(ref, int) else None
    if failed:
        out += f"\n\n{failed['method']} failed at {_clock(failed['at'])}:\n{failed['trace'].strip()}"
    return out


def _cluster_logs(cluster: str) -> list[str]:
    """The connection log of the cluster the error is about, else a little of each."""
    from ..hub import hub
    from . import clusters as cl
    try:
        chosen = [c for c in hub().clusters if not cluster or c.id == cluster]
    except RuntimeError:
        return []
    out = []
    for c in chosen:
        try:
            lines = cl.log(c.id, LOG_LINES if cluster else OTHER_LOG_LINES)
        except (OSError, ValueError, RuntimeError):
            continue
        if lines:
            out.append(f"{c.name} connection log\n" + "\n".join(lines))
    return out


def _log(cluster: str, lines: list[str]) -> str:
    parts = []
    failed = recent.failed()[-15:]
    if failed:
        parts.append("Recent errors\n" + "\n".join(
            f"{_clock(f['at'])}  {f['method']}: {f['message'].strip().splitlines()[-1] if f['message'].strip() else ''}"
            for f in failed))
    if lines:
        parts.append("In the app\n" + "\n".join(str(x) for x in lines[-40:]))
    return "\n\n".join(parts + _cluster_logs(cluster))


@method("report.preview")
def preview(kind: str = "error", error: str = "", ref: int | None = None, cluster: str = "",
            lines: list | None = None, page: str = "") -> dict:
    """Everything a report would send, scrubbed: the review window shows it as it is. lines: the app's own recent
    log (errors the page caught). The person's note and screenshot are added in the window."""
    if kind not in KINDS:
        raise ValueError(f"No report kind {kind}")
    k = known()
    out = {"kind": kind, "error": _cut(scrub.scrub(_error(error, ref), k), LIMITS["error"], "both"),
           "log": _cut(scrub.scrub(_log(cluster, lines or []), k), LIMITS["log"], "end"),
           "page": _cut(scrub.scrub(page, k), LIMITS["page"]),
           "app": __version__, "platform": _platform(), "os": _cut(_os(), LIMITS["os"])}
    if kind == "user":
        out["error"] = ""
    return out


@method("report.scrub")
def scrub_text(text: str) -> str:
    """The person's note as it would be sent (they see it change under the box)."""
    return _cut(scrub.scrub(text, known()), LIMITS["text"])


def _shot(screenshot: str) -> str:
    if not screenshot:
        return ""
    if not screenshot.startswith(SHOT_PREFIX):
        raise ValueError("The screenshot must be a PNG")
    if len(screenshot) - len(SHOT_PREFIX) > SHOT_BYTES * 4 // 3 + 4:
        raise ValueError("The screenshot is too big to send")
    return screenshot


def _refused(e: urllib.error.HTTPError) -> str:
    if e.code == 429:
        return "Too many reports were sent from here lately. Please try again in an hour."
    try:
        said = json.loads(e.read() or b"{}").get("error", "")
    except (ValueError, AttributeError, OSError):
        said = ""
    if 400 <= e.code < 500:
        return f"The report server turned the report down: {said}" if said else \
            f"The report server turned the report down (HTTP {e.code})."
    return f"The report server has a problem right now (HTTP {e.code}). Please try again later."


@method("report.send")
def send(report: dict, screenshot: str = "") -> dict:
    """Post the report as the review window showed it, plus the screenshot if the person ticked it. Scrubbed again
    on the way out, which changes nothing that was already scrubbed. {"id": the server's id for it}."""
    if report.get("kind") not in KINDS:
        raise ValueError("No report kind")
    k = known()
    body = {"kind": report["kind"], "app": __version__, "platform": _platform(), "os": _cut(_os(), LIMITS["os"])}
    for field in ("text", "error", "log", "page"):
        value = report.get(field)
        if isinstance(value, str) and value.strip():
            body[field] = _cut(scrub.scrub(value, k), LIMITS[field], "end" if field == "log" else "start")
    contact = report.get("contact")
    if isinstance(contact, str) and contact.strip():  # typed by the person so they can get an answer: kept
        body["contact"] = contact.strip()[:LIMITS["contact"]]
    if shot := _shot(screenshot):
        body["screenshot"] = shot
    req = urllib.request.Request(URL, data=json.dumps(body).encode(), method="POST", headers={
        "Content-Type": "application/json", "User-Agent": f"HPC Hub/{__version__}"})
    try:
        with urllib.request.urlopen(req, timeout=TIMEOUT) as r:
            answer = json.loads(r.read() or b"{}")
    except urllib.error.HTTPError as e:
        raise RuntimeError(_refused(e)) from None
    except (TimeoutError, socket.timeout):
        raise RuntimeError(f"The report server did not answer in {TIMEOUT} seconds. Please try again.") from None
    except urllib.error.URLError as e:
        if isinstance(e.reason, TimeoutError):
            raise RuntimeError(f"The report server did not answer in {TIMEOUT} seconds. Please try again.") from None
        raise RuntimeError("Could not reach the report server. Check that you are online and try again.") from None
    except (OSError, ValueError):
        raise RuntimeError("The report server sent an answer HPC Hub could not read.") from None
    rid = answer.get("id") if isinstance(answer, dict) else None
    if not isinstance(rid, str) or not rid:
        raise RuntimeError("The report server sent an answer HPC Hub could not read.")
    return {"id": rid}
