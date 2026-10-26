"""Windows' folders and askpass, checked on any system by pretending to be Windows."""

from hpc_hub.connect import askpass_server
from hpc_hub.core import paths


def test_folders_under_appdata(tmp_path, monkeypatch):
    monkeypatch.setattr(paths, "WINDOWS", True)
    for var in ("XDG_RUNTIME_DIR", "XDG_CACHE_HOME", "XDG_DATA_HOME"):
        monkeypatch.delenv(var, raising=False)
    monkeypatch.setenv("LOCALAPPDATA", str(tmp_path / "Local"))
    monkeypatch.setenv("APPDATA", str(tmp_path / "Roaming"))
    assert paths.runtime_dir() == tmp_path / "Local" / "HPC Hub"
    assert paths.log_dir() == tmp_path / "Roaming" / "HPC Hub" / "logs"
    assert paths.web_dir() == tmp_path / "Roaming" / "HPC Hub" / "web"
    assert all(p.is_dir() for p in (paths.runtime_dir(), paths.log_dir(), paths.web_dir()))


def test_runtime_dir_set_by_hand(tmp_path, monkeypatch):
    monkeypatch.setattr(paths, "WINDOWS", True)
    monkeypatch.setenv("XDG_RUNTIME_DIR", str(tmp_path / "run"))
    assert paths.runtime_dir() == tmp_path / "run" / "hpc-hub"


def test_askpass_keeps_handlers_without_a_socket(tmp_path, monkeypatch):
    monkeypatch.setattr(askpass_server, "WINDOWS", True)
    monkeypatch.setenv("XDG_RUNTIME_DIR", str(tmp_path))
    monkeypatch.delenv("SSH_ASKPASS", raising=False)  # Fedora's KDE/GNOME profile scripts set one
    server = askpass_server.AskpassServer()
    server.start()
    try:
        assert not server.path.exists()
        token = server.register(lambda prompt: "answer")
        env = server.env(token)
        assert env["HPC_HUB_ASKPASS_TOKEN"] == token and "SSH_ASKPASS" not in env
        assert server._find(token)("Password: ") == "answer"
    finally:
        server.stop()
