import secrets
import threading
import time
from collections.abc import Callable

from ...hub import hub

NAMES = {"pull": "update"}  # what the app calls a job in "Wait for the ... to finish"

_lock = threading.Lock()
_busy: dict[tuple[str, str], str] = {}  # (cluster, folder) -> the job running there


def run(kind: str, cluster: str, folder: str, work: Callable[[Callable[[str], None]], dict]) -> dict:
    """work(step) on a thread, one job per paper at a time; each step and the end go out as `latex-git` events."""
    key = (cluster, folder.rstrip("/"))
    with _lock:
        if key in _busy:
            raise RuntimeError(f"Wait for the {_busy[key]} to finish")
        _busy[key] = NAMES.get(kind, kind)
    jid, h = secrets.token_hex(6), hub()
    steps: list[dict] = []
    clock = [time.monotonic()]

    def emit(**extra):
        h.emit("latex-git", {"id": jid, "cluster": cluster, "folder": folder, "kind": kind, "steps": steps,
                             "done": False, **extra})

    def finish_step():
        if steps:
            steps[-1].update(done=True, seconds=round(time.monotonic() - clock[0], 1))
        clock[0] = time.monotonic()

    def step(label: str):
        finish_step()
        steps.append({"label": label, "seconds": 0, "done": False})
        emit()

    def go():
        try:
            result = work(step)
            finish_step()
            emit(done=True, ok=True, result=result)
        except Exception as e:  # noqa: BLE001 (it goes to the app as the job's end)
            emit(done=True, ok=False, error=str(e) or type(e).__name__)
        finally:
            with _lock:
                _busy.pop(key, None)
    threading.Thread(target=go, daemon=True, name=f"git-{kind}-{jid}").start()
    return {"id": jid}
