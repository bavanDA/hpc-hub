import ast
import io
import json
import pathlib
import subprocess
import sys
import threading
import time

from hpc_hub.api.server import Server, method


@method("test.add")
def _add(a, b):
    return a + b


@method("test.fail")
def _fail():
    raise ValueError("nope")


@method("test.missing")
def _missing():
    from hpc_hub.agents.catalog import NotInstalled
    raise NotInstalled("Claude isn't installed on Wulver")


def _run(lines: list[str]) -> list[dict]:
    out = io.StringIO()
    Server(out=out).serve(iter(lines))
    return sorted((json.loads(x) for x in out.getvalue().splitlines()), key=lambda m: str(m.get("id")))


def test_calls_errors_and_notifications():
    got = _run(['{"jsonrpc":"2.0","id":1,"method":"test.add","params":{"a":2,"b":3}}\n',
                '{"jsonrpc":"2.0","id":2,"method":"test.fail"}\n',
                '{"jsonrpc":"2.0","id":3,"method":"nope"}\n',
                '{"jsonrpc":"2.0","method":"test.add","params":[1,1]}\n',  # notification: no answer
                "not json\n"])
    by_id = {m["id"]: m for m in got}
    assert by_id[1]["result"] == 5
    assert by_id[2]["error"]["message"] == "nope" and by_id[3]["error"]["code"] == -32601
    assert by_id[None]["error"]["code"] == -32700 and len(got) == 4


def test_an_error_says_its_kind_so_the_app_can_act():
    got = _run(['{"jsonrpc":"2.0","id":1,"method":"test.missing"}\n',
                '{"jsonrpc":"2.0","id":2,"method":"test.fail"}\n'])
    assert got[0]["error"]["data"]["kind"] == "not-installed" and "ref" in got[0]["error"]["data"]
    assert "kind" not in got[1]["error"]["data"]  # an ordinary error has none


def test_events_and_lines_stay_whole():
    out = io.StringIO()
    s = Server(out=out)
    threads = [threading.Thread(target=s.emit, args=("log", {"i": i})) for i in range(50)]
    for t in threads:
        t.start()
    for t in threads:
        t.join()
    lines = out.getvalue().splitlines()
    assert len(lines) == 50 and all(json.loads(x)["params"]["name"] == "log" for x in lines)


def test_backend_process_answers_and_keeps_stdout_clean(tmp_path):
    import os
    req = '{"jsonrpc":"2.0","id":7,"method":"app.version"}\n'
    env = {**os.environ, "XDG_RUNTIME_DIR": str(tmp_path)}  # its own lock: a running HPC Hub doesn't matter
    res = subprocess.run([sys.executable, "-m", "hpc_hub.api"], input=req, capture_output=True, text=True,
                         timeout=30, env=env)
    messages = [json.loads(line) for line in res.stdout.splitlines()]  # every stdout line is protocol
    assert next(m for m in messages if m.get("id") == 7)["result"]["version"]


def _answers(out: io.StringIO) -> dict:
    return {m.get("id"): m for m in (json.loads(x) for x in out.getvalue().splitlines())}


def _wait_for(out: io.StringIO, rid, seconds: float = 5) -> dict | None:
    end = time.monotonic() + seconds
    while time.monotonic() < end:
        got = _answers(out).get(rid)
        if got:
            return got
        time.sleep(0.01)
    return None


_release = threading.Event()


@method("test.slow_wait", slow=True)
def _slow_wait():
    _release.wait(10)
    return "done"


@method("test.slow_fail", slow=True)
def _slow_fail():
    raise ValueError("slow nope")


def test_a_quick_call_answers_while_every_slow_worker_waits():
    _release.clear()
    out = io.StringIO()
    s = Server(out=out, workers=1, slow_workers=2)
    try:
        for i in range(4):  # more long waits than there are workers of either pool
            s.handle(json.dumps({"jsonrpc": "2.0", "id": f"w{i}", "method": "test.slow_wait"}))
        s.handle('{"jsonrpc":"2.0","id":"q","method":"test.add","params":{"a":2,"b":3}}')
        assert (_wait_for(out, "q") or {}).get("result") == 5
        assert not any(str(k).startswith("w") for k in _answers(out))  # the waits still wait
    finally:
        _release.set()
        s.pool.shutdown(wait=True)
        s.slow_pool.shutdown(wait=True)
    assert all(_answers(out)[f"w{i}"]["result"] == "done" for i in range(4))


def test_slow_calls_answer_errors_and_notifications_as_quick_ones_do():
    _release.set()
    got = _run(['{"jsonrpc":"2.0","id":1,"method":"test.slow_wait"}\n',
                '{"jsonrpc":"2.0","id":2,"method":"test.slow_fail"}\n',
                '{"jsonrpc":"2.0","method":"test.slow_wait"}\n'])  # notification: no answer
    by_id = {m["id"]: m for m in got}
    assert by_id[1]["result"] == "done" and len(got) == 2
    assert by_id[2]["error"]["message"] == "slow nope" and "ref" in by_id[2]["error"]["data"]


def test_a_slow_method_runs_on_the_slow_pool_and_a_quick_one_does_not():
    names = {}

    @method("test.where_slow", slow=True)
    def _where_slow():
        names["slow"] = threading.current_thread().name

    @method("test.where_quick")
    def _where_quick():
        names["quick"] = threading.current_thread().name

    got = _run(['{"jsonrpc":"2.0","id":1,"method":"test.where_slow"}\n',
                '{"jsonrpc":"2.0","id":2,"method":"test.where_quick"}\n',
                '{"jsonrpc":"2.0","id":3,"method":["not", "a", "name"]}\n'])
    assert names["slow"].startswith("rpc-slow") and not names["quick"].startswith("rpc-slow")
    assert [m["id"] for m in got] == [1, 2]  # a method that isn't a name doesn't stop the others


def _waits_long_in(path: pathlib.Path) -> dict[str, bool]:
    """The methods in a file that (through helpers of the same file) ask a question, wait for a sign-in or a node,
    or check a login over ssh: method name -> marked slow."""
    waits = {"question", "web_login", "for_connect", "_unsaved", "_node", "login_check.check"}
    tree = ast.parse(path.read_text())
    calls: dict[str, set[str]] = {}
    marked: dict[str, tuple[str, bool]] = {}
    for node in tree.body:
        if not isinstance(node, ast.FunctionDef):
            continue
        names = set()
        for n in ast.walk(node):
            if isinstance(n, ast.Call) and isinstance(n.func, ast.Attribute):
                owner = n.func.value.id if isinstance(n.func.value, ast.Name) else ""
                names.add(f"{owner}.{n.func.attr}" if owner == "login_check" else n.func.attr)
            elif isinstance(n, ast.Call) and isinstance(n.func, ast.Name):
                names.add(n.func.id)
        calls[node.name] = names
        for d in node.decorator_list:
            if isinstance(d, ast.Call) and getattr(d.func, "id", "") == "method":
                slow = any(k.arg == "slow" and getattr(k.value, "value", False) is True for k in d.keywords)
                marked[node.name] = (d.args[0].value, slow)

    def waits_long(fn: str, seen: set) -> bool:
        seen.add(fn)
        return any(c in waits or (c in calls and c not in seen and waits_long(c, seen)) for c in calls.get(fn, ()))
    return {name: slow for fn, (name, slow) in marked.items() if waits_long(fn, set())}


def test_methods_that_ask_you_or_wait_for_a_node_are_slow():
    from hpc_hub.api import methods
    found = {}
    for path in pathlib.Path(methods.__file__).parent.rglob("*.py"):
        found.update(_waits_long_in(path))
    assert {"clusters.connect", "clusters.check_login", "tools.agent_start", "tools.ask_start"} <= set(found)
    missing = sorted(name for name, slow in found.items() if not slow)
    assert not missing, f"these can wait minutes, mark them slow=True: {missing}"


def test_the_scan_sees_a_question_asked_through_a_helper(tmp_path):
    f = tmp_path / "m.py"
    f.write_text('def _ask():\n    return hub().question("ask", {})\n\n\n'
                 '@method("demo.ask")\ndef ask():\n    return _ask()\n\n\n'
                 '@method("demo.ask_slow", slow=True)\ndef ask_slow():\n    return _ask()\n\n\n'
                 '@method("demo.quick")\ndef quick():\n    return 1\n')
    assert _waits_long_in(f) == {"demo.ask": False, "demo.ask_slow": True}


def test_the_long_methods_are_slow_and_the_quick_ones_stay_quick():
    from hpc_hub.api import methods
    from hpc_hub.api.server import METHODS, SLOW
    methods.load_all()
    for name in ("clusters.connect", "clusters.check_login", "keys.test", "jobs.submit", "files.zip",
                 "files.extract", "files.move", "files.delete", "latex.git_pull", "latex.git_push", "chat.mode"):
        assert name in METHODS and name in SLOW, name
    for name in ("clusters.list", "app.version", "files.list", "question.answer", "clusters.cancel",
                 "sessions.list", "updates.quick_fix"):
        assert name in METHODS and name not in SLOW, name
