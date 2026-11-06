import secrets
import shlex
import subprocess
import threading
import time
from dataclasses import asdict, dataclass, field

from ....core.config import LATEX_ENGINES
from ....latex import build as latexmk
from ....latex import saved
from ...hub import hub
from ...server import method

LOG_LIMIT = 2 * 1024 * 1024
LOG_EVERY = 0.25  # seconds between log events while a build runs
BUILD_SECONDS = 900

_lock = threading.Lock()
_builds: dict[str, "Build"] = {}


@dataclass
class Build:
    id: str
    cluster: str
    main: str
    started: float = field(default_factory=time.monotonic)
    log: list[str] = field(default_factory=list)
    proc: subprocess.Popen | None = None
    stopped: bool = False


def settings(cluster: str) -> dict:
    return asdict(hub().session(cluster).cfg.latex)


@method("latex.save_settings")
def save_settings(cluster: str, setup: str = "", engine: str = "pdf", on_node: bool = True) -> dict:
    if engine not in LATEX_ENGINES:
        raise ValueError(f"No engine {engine}")
    s = hub().session(cluster).cfg.latex
    s.setup, s.engine, s.on_node = setup.strip(), engine, bool(on_node)
    hub().save_clusters()
    return asdict(s)


def where_built(cluster: str, script: str) -> str:
    """On your compute node when the settings say so and you have one, else on the login node."""
    s = hub().connected(cluster)
    a = s.allocation
    if a and a.job_id and s.cfg.latex.on_node:
        return f"srun --jobid={int(a.job_id)} --overlap bash -c {shlex.quote(script)}"
    return script


@method("latex.build")
def build(cluster: str, main: str) -> dict:
    """Log lines come as `latex-log` events, the end as one `latex-build` event."""
    s = hub().connected(cluster)
    command = where_built(cluster, latexmk.build_script(main, s.cfg.latex))
    b = Build(secrets.token_hex(6), cluster, main)
    with _lock:
        if any(x.cluster == cluster and x.main == main for x in _builds.values()):
            raise RuntimeError("It is building already")
        _builds[b.id] = b
    b.proc = subprocess.Popen(s.ssh.argv(command), stdin=subprocess.DEVNULL, stdout=subprocess.PIPE,
                              stderr=subprocess.STDOUT, text=True, errors="replace", bufsize=1)
    threading.Thread(target=_watch, args=(b,), daemon=True, name=f"latex-{b.id}").start()
    return {"id": b.id}


def _stream_log(b: Build) -> int:
    h, pending, last, size = hub(), [], 0.0, 0
    for line in b.proc.stdout:
        if size < LOG_LIMIT:
            b.log.append(line)
            size += len(line)
        pending.append(line)
        if time.monotonic() - last > LOG_EVERY:
            h.emit("latex-log", {"id": b.id, "text": "".join(pending)})
            pending, last = [], time.monotonic()
    if pending:
        h.emit("latex-log", {"id": b.id, "text": "".join(pending)})
    return b.proc.wait()


def _watch(b: Build) -> None:
    h = hub()
    timer = threading.Timer(BUILD_SECONDS, lambda: _kill(b))
    timer.start()
    try:
        code = _stream_log(b)
    finally:
        timer.cancel()
        with _lock:
            _builds.pop(b.id, None)
    ok = code == 0 and not b.stopped
    if ok:
        try:
            saved.auto(h.connected(b.cluster).ssh, b.main, "Compiled")
        except Exception:  # noqa: BLE001 (not connected any more: no version, no error)
            pass
    log = "".join(b.log)
    h.emit("latex-build", {"id": b.id, "cluster": b.cluster, "main": b.main, "ok": ok, "code": code,
                           "stopped": b.stopped, "seconds": round(time.monotonic() - b.started, 1),
                           "issues": latexmk.issues(log), "log": log[-200_000:]})


def _kill(b: Build) -> None:
    b.stopped = True
    if b.proc and b.proc.poll() is None:
        b.proc.terminate()


@method("latex.stop")
def stop(id: str) -> None:  # noqa: A002 - the contract's name
    with _lock:
        b = _builds.get(id)
    if b:
        _kill(b)
