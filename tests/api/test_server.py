import io
import json
import subprocess
import sys
import threading

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
