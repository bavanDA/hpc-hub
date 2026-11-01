"""Asking an agent about code: the prompt, and run.sh run for real with bash and git against fake agents."""

import base64
import json
import shutil
import subprocess
import sys
import time

import pytest

from hpc_hub.code import asks

pytestmark = pytest.mark.skipif(sys.platform == "win32" or not shutil.which("git"),
                                reason="posix: run.sh is bash with git, as on the cluster")


def make_ask(**kw) -> asks.Ask:
    base = {"id": "20261101-120000-abcd", "agent": "claude", "agent_name": "Claude", "kind": "explain",
            "path": "~/proj/src/train.py", "from_line": 40, "to_line": 58}
    return asks.Ask(**{**base, **kw})


def test_prompt_says_where_and_never_edit():
    p = asks.prompt(make_ask())
    assert "Explain what train.py, lines 40 to 58 does" in p
    assert "Do not change any file in the repository" in p and "$OUT/proposed/" in p and "$OUT/answer.md" in p
    fix = asks.prompt(make_ask(kind="fix", question="", error_text="Traceback\nValueError: bad shape"))
    assert "fix it" in fix and "ValueError: bad shape" in fix
    free = asks.prompt(make_ask(kind="free", question="Why is this slow?", from_line=0, to_line=0))
    assert free.startswith("Why is this slow?") and "the whole file" in free
    assert asks.where(make_ask(from_line=7, to_line=7)) == "train.py, line 7"


def test_ids_and_states():
    assert asks.ID.match(asks.new_id(0))
    with pytest.raises(ValueError):
        asks.check_id("../etc")
    st = asks.status_of({"id": "x", "kind": "fix", "agent": "claude", "agent_name": "Claude",
                         "path": "~/p/a.py", "started": 5}, "running")
    assert st.detail == "Claude is reading a.py"
    assert asks.status_of({}, "nonsense").state == "failed"


@pytest.fixture
def repo(tmp_path):
    home = tmp_path / "home"
    proj = home / "proj"
    (proj / "src").mkdir(parents=True)
    (proj / "src" / "train.py").write_text("lr = 0.1\n")
    (proj / "README.md").write_text("hi\n")
    (proj / "notes.txt").write_text("mine, not committed\n")
    git = ["git", "-C", str(proj), "-c", "user.email=jdoe@example.com", "-c", "user.name=jdoe"]
    subprocess.run([*git, "init", "-q"], check=True)
    subprocess.run([*git, "add", "src", "README.md"], check=True)
    subprocess.run([*git, "commit", "-qm", "start"], check=True)
    (proj / "README.md").write_text("hi, edited by you\n")  # dirty before the ask: never touched
    return home


def run(home, agent_cmd: str, **kw) -> asks.Result:
    a = make_ask(**kw)
    env = {"HOME": str(home), "PATH": "/usr/bin:/bin"}
    subprocess.run(["bash", "-c", asks.start_command(a, asks.script(a, agent_cmd), asks.run_line(a))],
                   env=env)  # run.sh exits non-zero when the agent or the folder fails; state says so
    out = home / asks.ROOT / a.id
    assert json.loads((out / "meta.json").read_text())["kind"] == a.kind
    b64 = subprocess.run(["bash", "-c", asks.fetch_command(a.id)], env=env, capture_output=True, text=True).stdout
    return asks.parse_result(a.id, b64)


def test_a_good_agent_proposes(repo):
    agent = ('mkdir -p "$OUT/proposed/src" && printf "lr = 0.01\\n" > "$OUT/proposed/src/train.py" && '
             'printf "Lowered the learning rate.\\n" > "$OUT/answer.md" && grep -q "src/train.py" "$OUT/prompt.md"')
    r = run(repo, agent, kind="fix")
    assert r.state == "done" and r.answer == "Lowered the learning rate."
    (f,) = r.files
    assert f.path.endswith("/proj/src/train.py") and f.original == "lr = 0.1\n" and f.proposed == "lr = 0.01\n"
    assert not f.is_new and len(f.base_sha) == 64 and r.put_back == []
    assert (repo / "proj/src/train.py").read_text() == "lr = 0.1\n"


def test_edits_in_place_become_proposals_and_are_put_back(repo):
    agent = ('printf "lr = 0.5\\n" > src/train.py && mkdir -p tests && printf "def test_x(): pass\\n" '
             '> tests/test_train.py && printf "changed\\n" > README.md && echo "done, sorry"')
    r = run(repo, agent, kind="test")
    files = {f.path.rsplit("/proj/", 1)[1]: f for f in r.files}
    assert set(files) == {"src/train.py", "tests/test_train.py"}  # README was yours, left alone
    assert files["src/train.py"].proposed == "lr = 0.5\n" and files["src/train.py"].original == "lr = 0.1\n"
    assert files["tests/test_train.py"].is_new and files["tests/test_train.py"].base_sha == ""
    assert (repo / "proj/src/train.py").read_text() == "lr = 0.1\n"  # put back
    assert not (repo / "proj/tests/test_train.py").exists()
    assert (repo / "proj/README.md").read_text() == "changed\n"  # not ours to undo
    assert sorted(r.put_back) == ["src/train.py", "tests/test_train.py"]
    assert r.answer == "done, sorry"  # no answer.md: the log is the answer


def test_a_failing_agent_and_claude_json(repo):
    r = run(repo, "echo 'claude: not found' >&2; exit 127")
    assert r.state == "failed" and "not found" in r.answer and r.files == []
    st = asks.parse_list(subprocess.run(["bash", "-c", asks.list_command()], env={"HOME": str(repo),
                         "PATH": "/usr/bin:/bin"}, capture_output=True, text=True).stdout)
    assert st[0].state == "failed" and "not found" in st[0].detail
    claude = json.dumps({"type": "result", "result": "It trains a model.", "session_id": "abc-123"})
    r = run(repo, f"echo {base64.b64encode(claude.encode()).decode()} | base64 -d", id="20261101-120001-beef")
    assert r.answer == "It trains a model." and r.chat_id == "abc-123"


def test_a_missing_folder_fails_cleanly(repo):
    r = run(repo, "true", path="~/nowhere/x.py")
    assert r.state == "failed"


def test_cancel_stops_the_agent_and_puts_files_back(repo):
    a = make_ask(id="20261101-120002-cafe")
    env = {"HOME": str(repo), "PATH": "/usr/bin:/bin"}
    agent = 'printf "lr = 9\\n" > src/train.py; sleep 30'
    proc = subprocess.Popen(["bash", "-c", asks.start_command(a, asks.script(a, agent), asks.run_line(a))], env=env)
    out = repo / asks.ROOT / a.id
    for _ in range(200):
        if (out / "pid").exists() and (repo / "proj/src/train.py").read_text() == "lr = 9\n":
            break
        time.sleep(0.05)
    subprocess.run(["bash", "-c", asks.cancel_command(a.id)], env=env, check=True)
    assert proc.wait(timeout=10) == 0
    assert (out / "state").read_text() == "cancelled"
    assert (repo / "proj/src/train.py").read_text() == "lr = 0.1\n"  # put back even though it was stopped
    (st,) = asks.parse_list(subprocess.run(["bash", "-c", asks.list_command(ask_id=a.id)], env=env,
                                           capture_output=True, text=True).stdout)
    assert st.state == "cancelled" and st.detail == "Stopped"
