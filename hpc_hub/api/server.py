"""JSON-RPC 2.0 over stdin/stdout, one JSON message per line: how the Tauri UI talks to the Python logic.

Requests run on worker threads, so a slow cluster never blocks the others. Calls that can wait a long time (for
you to answer a sign-in question, for a node, for a big job on the cluster) run on workers of their own, so quick
calls always find one free. Events (session state, logs, progress) go out as notifications:
{"jsonrpc": "2.0", "method": "event", "params": {"name": ..., "data": ...}}.
stdout carries only protocol messages; anything printed goes to stderr.
"""

import json
import sys
import threading
import traceback
from collections.abc import Callable
from concurrent.futures import ThreadPoolExecutor

from . import recent

METHODS: dict[str, Callable] = {}
SLOW: set[str] = set()  # methods that may wait minutes: they get the slow pool


def method(name: str, slow: bool = False):
    """Register a function the UI may call by name, with keyword params. slow: it may wait a long time (a question
    to you, a node from the queue, a long command), so it runs on the slow pool and never holds a quick call up."""
    def add(fn):
        METHODS[name] = fn
        if slow:
            SLOW.add(name)
        else:
            SLOW.discard(name)
        return fn
    return add


class Server:
    def __init__(self, out=None, workers: int = 16, slow_workers: int = 16):
        self.out = out or sys.stdout
        self.lock = threading.Lock()
        self.pool = ThreadPoolExecutor(max_workers=workers, thread_name_prefix="rpc")
        self.slow_pool = ThreadPoolExecutor(max_workers=slow_workers, thread_name_prefix="rpc-slow")

    def send(self, message: dict) -> None:
        line = json.dumps(message, separators=(",", ":"), default=str)
        with self.lock:
            self.out.write(line + "\n")
            self.out.flush()

    def emit(self, name: str, data=None) -> None:
        self.send({"jsonrpc": "2.0", "method": "event", "params": {"name": name, "data": data}})

    def handle(self, line: str) -> None:
        try:
            msg = json.loads(line)
        except ValueError:
            self.send({"jsonrpc": "2.0", "id": None, "error": {"code": -32700, "message": "Parse error"}})
            return
        if not isinstance(msg, dict) or "method" not in msg:
            self.send({"jsonrpc": "2.0", "id": None, "error": {"code": -32600, "message": "Invalid request"}})
            return
        pool = self.slow_pool if isinstance(msg["method"], str) and msg["method"] in SLOW else self.pool
        pool.submit(self._call, msg)

    def _call(self, msg: dict) -> None:
        rid, name, params = msg.get("id"), msg["method"], msg.get("params") or {}
        fn = METHODS.get(name)
        if fn is None:
            reply = {"error": {"code": -32601, "message": f"No method {name}"}}
        else:
            try:
                reply = {"result": fn(**params) if isinstance(params, dict) else fn(*params)}
            except Exception as e:  # noqa: BLE001 - every failure goes back to the UI
                trace = traceback.format_exc()
                sys.stderr.write(trace)
                message = str(e) or type(e).__name__
                # ref: the UI keeps it with the error it shows, so a bug report can send this traceback
                ref = recent.note(name, message, trace)
                data = {"ref": ref}
                if isinstance(getattr(e, "kind", None), str):  # what kind of failure, for the UI to act on
                    data["kind"] = e.kind
                reply = {"error": {"code": -32000, "message": message, "data": data}}
        if rid is not None:  # no id: a notification, no answer wanted
            self.send({"jsonrpc": "2.0", "id": rid, **reply})

    def serve(self, stream=None) -> None:
        for line in stream or sys.stdin:
            if line.strip():
                self.handle(line)
        self.pool.shutdown(wait=True)
        self.slow_pool.shutdown(wait=True)
