"""The backend's live state: one ClusterSession per cluster (picking up connections that are already up), whose
changes go out as events, and questions a login asks you, answered from the UI."""

import json
import secrets
import threading
import time
from concurrent.futures import Future, InvalidStateError
from concurrent.futures import TimeoutError as Timeout
from urllib.parse import urlsplit

from ..connect import chrome_window
from ..connect.askpass_server import AskpassServer
from ..connect.session import SSO_PASS, SSO_USER, ClusterSession
from ..connect.state import State
from ..core import browser, config, credentials, single

QUESTION_SECONDS = 600


def session_json(s: ClusterSession) -> dict:
    a = s.allocation
    return {"id": s.cfg.id, "state": s.state.value, "detail": s.detail, "connected": s.connected,
            "node": a.node if a else "", "job": a.job_id if a else "", "owned": a.owned if a else False}


class Hub:
    """Listener of every session (called on worker threads): changes become events, questions wait for the UI."""

    blocked = False  # another HPC Hub holds the lock: leave the clusters alone (see core/single.py)

    def __init__(self, emit):
        self.emit = emit
        self.askpass = AskpassServer("askpass-app.sock")
        self.clusters = config.chosen(config.load(), config.load_app())
        self.sessions: dict[str, ClusterSession] = {}
        self._questions: dict[str, Future] = {}

    def start(self) -> None:
        if not single.take():
            self.blocked = True  # sessions stay empty: nothing to adopt, check or connect
            self.emit("blocked", {"message": single.MESSAGE})
            return
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

    def use_clusters(self, ids: list[str]) -> None:
        """Change which clusters the app shows (first run, or Preferences). A connected one can't be dropped."""
        everything = {c.id: c for c in config.load()}
        kept = {c.id: c for c in self.clusters}
        for cid, s in self.sessions.items():
            if cid not in ids and s.state != State.DISCONNECTED:
                raise RuntimeError(f"Disconnect {s.cfg.name} first")
        self.clusters = [kept.get(i) or everything[i] for i in ids]
        for cid in list(self.sessions):
            if cid not in ids:
                del self.sessions[cid]
        for c in self.clusters:
            if c.id not in self.sessions:
                self.sessions[c.id] = ClusterSession(c, self.askpass, self)
        self.save_clusters()

    def save_clusters(self) -> None:
        config.save_chosen(self.clusters)

    def session(self, cluster: str) -> ClusterSession:
        if self.blocked:
            raise RuntimeError(single.MESSAGE)
        if cluster not in self.sessions:
            raise ValueError(f"No cluster {cluster}")
        return self.sessions[cluster]

    def connected(self, cluster: str) -> ClusterSession:
        s = self.session(cluster)
        if not s.connected:
            raise RuntimeError(f"Connect to {s.cfg.name} first")
        return s

    # -- questions ---------------------------------------------------------------------
    def question(self, kind: str, data: dict, future: Future | None = None) -> str | None:
        """Ask the UI and wait (worker thread). None: cancelled or no answer in time. Pass a future to answer it
        from elsewhere too."""
        qid = secrets.token_hex(8)
        future = Future() if future is None else future
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

    def confirm(self, s: ClusterSession, title: str, text: str) -> bool:
        return self.question("confirm", {"cluster": s.cfg.id, "name": s.cfg.name, "title": title,
                                         "prompt": text}) == "yes"

    def pick_browser(self, s: ClusterSession) -> str | None:
        """Where to sign in to the VPN: "" = the app's window, chrome_window.CHOICE = our Chrome window, else a
        Chrome profile's name. None: cancelled."""
        found = browser.profiles() if browser.chrome() else []
        window = chrome_window.CHOICE if chrome_window.available() else ""
        if not (found or window):
            return ""
        answer = self.question("pick-browser", {"cluster": s.cfg.id, "name": s.cfg.name, "default": s.cfg.vpn.browser,
                                                "chrome_window": window,
                                                "profiles": [{"name": p.name, "email": p.email} for p in found]})
        if answer is None or answer == "" or (window and answer == window):
            return answer
        return answer if any(p.name == answer for p in found) else None

    def web_login(self, s: ClusterSession, start, login, profile: str = "") -> tuple[str, str]:
        """VPN web sign-in (AnyConnect SAML): (token, error). In a Chrome profile the app picks the token cookie
        up from Chrome, in our Chrome window (chrome_window.CHOICE) over the DevTools pipe; otherwise in the app's
        sign-in window (app/src-tauri/src/sso.rs), which gets the saved login from the askpass socket, so the
        password never reaches the UI."""
        data = {"cluster": s.cfg.id, "name": s.cfg.name}
        if profile:
            if profile == chrome_window.CHOICE:
                token, err = self._chrome_window_login(data, start)
            else:
                token, err = self._chrome_login(data, start, profile)
            if token or err != "in-app":
                return token, err
        fill = {SSO_USER: login.username, SSO_PASS: login.password}
        key = self.askpass.register(fill.get)
        try:
            answer = self.question("web-login", {
                **data, "login_url": start.login_url, "final_url": start.final_url,
                "token_cookie": start.token_cookie, "error_cookie": start.error_cookie,
                "fill": {"socket": str(self.askpass.path), "token": key} if login.password else None})
        finally:
            self.askpass.unregister(key)
        try:
            got = json.loads(answer) if answer else {}
        except ValueError:
            got = {}
        token = got.get("token") if isinstance(got, dict) else ""
        if isinstance(token, str) and token:
            return token, ""
        err = got.get("error") if isinstance(got, dict) else ""
        return "", err if isinstance(err, str) and err else "Sign-in cancelled"

    def _chrome_window_login(self, data: dict, start) -> tuple[str, str]:
        """Sign in in our own Chrome window (connect/chrome_window.py), which reports the token the moment it is
        set, while the UI shows "Sign in in the app instead" ("in-app" as the error) and Cancel."""
        stop, future, got = threading.Event(), Future(), {}

        def work() -> None:
            got["result"] = chrome_window.sign_in(start, stop.is_set, QUESTION_SECONDS)
            try:
                future.set_result("done")
            except InvalidStateError:  # answered from the UI meanwhile
                pass

        threading.Thread(target=work, daemon=True).start()
        try:
            answer = self.question("chrome-window", data, future)
        finally:
            stop.set()  # closes the window if it is still open
        if answer == "done":
            return got.get("result", ("", "Sign-in cancelled"))
        return "", "in-app" if answer == "in-app" else "Sign-in cancelled"

    def _chrome_login(self, data: dict, start, profile: str) -> tuple[str, str]:
        """Sign in in a Chrome profile: open the page there and wait for the token cookie, while the UI shows
        "Open the page again" and "Sign in in the app instead" ("in-app" as the error)."""
        found = browser.find(profile)
        if not found:
            return "", f"No Chrome profile named {profile}"
        from ..connect import chrome_cookies
        host = urlsplit(start.final_url or start.login_url).hostname or ""
        since, stop, lock = time.time() - 5, threading.Event(), threading.Lock()
        shown: dict = {}  # the question on screen now, and the token once Chrome has it

        def wait() -> None:
            token = chrome_cookies.wait_for(found.folder, host, start.token_cookie, since, stop.is_set,
                                            QUESTION_SECONDS)
            with lock:
                shown["token"] = token
                future = shown.get("future")
            if token and future and not future.done():
                future.set_result("signed-in")

        browser.open_url(start.login_url, found.name)
        threading.Thread(target=wait, daemon=True).start()
        try:
            while True:
                qid, future = secrets.token_hex(8), Future()
                with lock:
                    if shown.get("token"):
                        return shown["token"], ""
                    shown["future"] = future
                self._questions[qid] = future
                self.emit("question", {"id": qid, "kind": "browser-login", **data, "profile": found.name})
                try:
                    answer = future.result(QUESTION_SECONDS)
                except Timeout:
                    answer = None
                finally:
                    self._questions.pop(qid, None)
                    self.emit("question-done", {"id": qid})
                if shown.get("token"):
                    return shown["token"], ""
                if answer == "again":
                    browser.open_url(start.login_url, found.name)
                elif answer == "in-app":
                    return "", "in-app"
                else:
                    return "", "Sign-in cancelled"
        finally:
            stop.set()

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
