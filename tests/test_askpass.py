import subprocess

from hpc_hub.connect.askpass_server import AskpassServer
from hpc_hub.core.paths import ASKPASS_BIN


def run(env, prompt):
    return subprocess.run([str(ASKPASS_BIN), prompt], env=env, capture_output=True, text=True)


def test_round_trip(tmp_path, monkeypatch):
    monkeypatch.setenv("XDG_RUNTIME_DIR", str(tmp_path))
    server = AskpassServer()
    server.start()
    try:
        seen = []
        token = server.register(lambda prompt: seen.append(prompt) or "s3cret")
        out = run(server.env(token), "Password: ")
        assert out.returncode == 0 and out.stdout == "s3cret\n"
        assert seen == ["Password: "]

        bad = run(server.env("wrong"), "Password: ")
        assert bad.returncode == 1 and bad.stdout == ""

        refuse = server.register(lambda prompt: None)
        assert run(server.env(refuse), "x").returncode == 1
    finally:
        server.stop()
