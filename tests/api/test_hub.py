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
