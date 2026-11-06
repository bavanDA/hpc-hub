import threading

from hpc_hub.api.hub import Hub


def test_question_waits_for_the_answer():
    events = []
    h = Hub(lambda name, data: events.append((name, data)))
    got = {}
    t = threading.Thread(target=lambda: got.update(answer=h.question("code", {"cluster": "x"})))
    t.start()
    while not events:
        pass
    name, data = events[0]
    assert name == "question" and data["kind"] == "code" and data["cluster"] == "x"
    h.answer(data["id"], "123456")
    t.join(5)
    assert got["answer"] == "123456" and events[-1] == ("question-done", {"id": data["id"]})
    h.answer(data["id"], "late")  # answering twice, or too late, is harmless


def test_second_app_leaves_the_clusters_alone(monkeypatch):
    from hpc_hub.core import single
    monkeypatch.setattr(single, "take", lambda: False)
    events = []
    h = Hub(lambda name, data: events.append(name))
    h.start()
    assert h.blocked and h.sessions == {} and events == ["blocked"]
    try:
        h.session("wulver")
        raise AssertionError("should refuse")
    except RuntimeError as e:
        assert "Another HPC Hub is open" in str(e)


def test_single_lock(tmp_path, monkeypatch):
    import subprocess
    import sys
    monkeypatch.setenv("XDG_RUNTIME_DIR", str(tmp_path))
    from hpc_hub.core import single
    monkeypatch.setattr(single, "_held", None)
    assert single.take()
    code = "from hpc_hub.core import single; print(single.take())"
    other = subprocess.run([sys.executable, "-c", code], capture_output=True, text=True, env={
        "XDG_RUNTIME_DIR": str(tmp_path), "PATH": "/usr/bin", "HOME": str(tmp_path)})
    assert other.stdout.strip() == "False"  # a second process can't take it while this one holds it



def test_sessions_list_and_answers(monkeypatch):
    from hpc_hub.api import hub as hub_mod
    from hpc_hub.api.methods import app, sessions
    from hpc_hub.connect.session import ClusterSession
    from hpc_hub.core import config
    h = Hub(lambda *a: None)
    h.sessions = {c.id: ClusterSession(c, None, h) for c in config.default_clusters()[:1]}
    monkeypatch.setattr(hub_mod, "_hub", h)
    got = sessions.sessions()
    assert [s["id"] for s in got] == ["wulver"] and got[0]["state"] == "Disconnected" and got[0]["node"] == ""
    assert app.status() == {"blocked": False, "message": ""}
    asked = []
    monkeypatch.setattr(h, "answer", lambda qid, answer: asked.append((qid, answer)))
    sessions.answer("abc123", "yes")
    assert asked == [("abc123", "yes")]
    h.blocked = True
    assert app.status()["blocked"] and "Another HPC Hub" in app.status()["message"]
    try:
        sessions.sessions()
        raise AssertionError("should refuse")
    except RuntimeError as e:
        assert "Another HPC Hub is open" in str(e)
