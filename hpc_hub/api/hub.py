"""The backend's live state: one ClusterSession per cluster (picking up connections that are already up), whose
changes go out as events, and questions a login asks you, answered from the UI."""

import secrets
import threading
from concurrent.futures import Future
from concurrent.futures import TimeoutError as Timeout

from ..connect.askpass_server import AskpassServer
from ..connect.session import ClusterSession
from ..core import config, credentials

QUESTION_SECONDS = 600


def session_json(s: ClusterSession) -> dict:
    a = s.allocation
    return {"id": s.cfg.id, "state": s.state.value, "detail": s.detail, "connected": s.connected,
            "node": a.node if a else "", "job": a.job_id if a else "", "owned": a.owned if a else False}


class Hub:
    """Listener of every session (called on worker threads): changes become events, questions wait for the UI."""

    def __init__(self, emit):
        self.emit = emit
        self.askpass = AskpassServer("askpass-app.sock")
        self.clusters = config.load()
        self.sessions: dict[str, ClusterSession] = {}
        self._questions: dict[str, Future] = {}

    def start(self) -> None:
        self.askpass.start()
        self.sessions = {c.id: ClusterSession(c, self.askpass, self) for c in self.clusters}
        threading.Thread(target=self._adopt_all, daemon=True).start()

    def _adopt_all(self) -> None:
        """Connections already up (the GTK app, or a restart) are used as they are."""
        for s in self.sessions.values():
            try:  # a keyring hiccup on one cluster must not stop the others
                login = credentials.load(s.cfg.id, credentials.SSH)
                s.adopt(login.username if login else "")
            except Exception:  # noqa: BLE001 - a cluster we can't pick up stays disconnected
                pass

    def save_clusters(self) -> None:
        config.save(self.clusters)

    def session(self, cluster: str) -> ClusterSession:
        if cluster not in self.sessions:
            raise ValueError(f"No cluster {cluster}")
        return self.sessions[cluster]

    def connected(self, cluster: str) -> ClusterSession:
        s = self.session(cluster)
        if not s.connected:
            raise RuntimeError(f"Connect to {s.cfg.name} first")
        return s

    # -- questions ---------------------------------------------------------------------
    def question(self, kind: str, data: dict) -> str | None:
        """Ask the UI and wait (worker thread). None: cancelled or no answer in time."""
        qid = secrets.token_hex(8)
        future: Future = Future()
        self._questions[qid] = future
        self.emit("question", {"id": qid, "kind": kind, **data})
        try:
            return future.result(QUESTION_SECONDS)
        except Timeout:
            return None
        finally:
            self._questions.pop(qid, None)
            self.emit("question-done", {"id": qid})

    def answer(self, qid: str, answer: str | None) -> None:
        future = self._questions.get(qid)
        if future and not future.done():
            future.set_result(answer)

    # -- Listener ------------------------------------------------------------------------
    def state_changed(self, s: ClusterSession) -> None:
        self.emit("session", session_json(s))

    def log(self, s: ClusterSession, line: str) -> None:
        self.emit("log", {"id": s.cfg.id, "line": line})

    def ask(self, s: ClusterSession, prompt: str) -> str | None:
        return self.question("ask", {"cluster": s.cfg.id, "name": s.cfg.name, "prompt": prompt})

    def code(self, s: ClusterSession, prompt: str) -> str | None:
        return self.question("code", {"cluster": s.cfg.id, "name": s.cfg.name, "prompt": prompt})

    def pick_browser(self, s: ClusterSession) -> str | None:
        return self.question("pick-browser", {"cluster": s.cfg.id, "name": s.cfg.name})

    def web_login(self, s: ClusterSession, start, login, profile: str = "") -> tuple[str, str]:
        return "", "VPN web sign-in is not in the new app yet. Use the GTK app for this cluster"


_hub: Hub | None = None


def hub() -> Hub:
    if _hub is None:
        raise RuntimeError("The backend has not started")
    return _hub


def start(emit) -> Hub:
    global _hub
    _hub = Hub(emit)
    _hub.start()
    return _hub
