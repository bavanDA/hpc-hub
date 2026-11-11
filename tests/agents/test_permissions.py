import json
import subprocess

from hpc_hub.agents import permissions
from hpc_hub.agents.permissions import FILES, Permissions


def test_fresh_cluster_gets_the_suggested_list():
    p = permissions.parse('{"theme": "dark"}', "")
    assert "grep" in p.allowed and "rm" not in p.allowed and p.trash and p.accept_edits
    assert p.ask == {"scancel", "force_push", "discard"}


def test_apply_keeps_other_settings_and_rules():
    p = Permissions(allowed={"grep", "conda"}, trash=True, ask={"scancel"},
                    settings={"theme": "dark", "permissions": {"allow": ["WebFetch", "Bash(ls:*)"],
                                                                "deny": ["Read(./.env)"]}})
    s = permissions.apply(p)
    assert s["theme"] == "dark"
    assert s["permissions"]["allow"] == ["WebFetch", "Bash(conda:*)", "Bash(grep:*)", "Bash(trash:*)"]
    assert s["permissions"]["deny"] == ["Read(./.env)", "Bash(rm:*)"]
    assert s["permissions"]["ask"] == ["Bash(scancel:*)"]
    assert s["permissions"]["defaultMode"] == "acceptEdits"
    assert len(s["hooks"]["PreToolUse"]) == 1


def test_roundtrip_and_turning_things_off():
    p = Permissions(allowed={"git"}, trash=False, ask=set(), accept_edits=False,
                    settings={"permissions": {"defaultMode": "acceptEdits", "deny": ["Bash(rm:*)"]}})
    s = permissions.apply(p)
    assert "Bash(rm:*)" not in s["permissions"]["deny"] and "defaultMode" not in s["permissions"]
    back = permissions.parse(json.dumps(s), json.dumps({"trash": False, "ask": []}))
    assert back.allowed == {"git"} and not back.trash and back.ask == set() and not back.accept_edits
    assert back.custom == []


def _guard(cmd, conf=None, tmp=None):
    script = FILES / "guard.py"
    if tmp is not None:
        (tmp / "guard.py").write_text(script.read_text())
        (tmp / "guard.json").write_text(json.dumps(conf))
        script = tmp / "guard.py"
    out = subprocess.run(["python3", str(script)], input=json.dumps({"tool_input": {"command": cmd}}),
                         capture_output=True, text=True).stdout
    return json.loads(out)["hookSpecificOutput"]["permissionDecision"] if out else "pass"


def test_guard(tmp_path):
    assert _guard("rm -rf build") == "deny"
    assert _guard("cd x && FOO=1 rm a") == "deny"
    assert _guard("find . -exec rm {} +") == "deny"
    assert _guard("git rm old.py") == "pass"
    assert _guard("grep -rn rm src") == "pass"
    assert _guard("scancel 12") == "ask"
    assert _guard("git push origin main -f") == "ask"
    assert _guard("git push origin main") == "pass"
    assert _guard("git reset --hard HEAD") == "ask"
    assert _guard("rm -rf build", {"trash": False, "ask": []}, tmp_path) == "pass"
    assert _guard("scancel 12", {"trash": True, "ask": ["force_push"]}, tmp_path) == "pass"


def test_save_command_is_valid_bash():
    cmd = permissions.save_command(permissions.parse("", ""))
    assert subprocess.run(["bash", "-n", "-c", cmd]).returncode == 0


def test_trash_script_is_valid_bash():
    assert subprocess.run(["bash", "-n", str(FILES / "trash")]).returncode == 0


def test_set_key_keeps_other_settings(tmp_path):
    home = tmp_path
    (home / ".claude").mkdir()
    (home / ".claude" / "settings.json").write_text('{"theme": "dark"}')
    cmd = permissions.set_key_command("remoteControlAtStartup", True)
    assert subprocess.run(["bash", "-c", cmd], env={"HOME": str(home), "PATH": "/usr/bin:/bin"}).returncode == 0
    assert json.loads((home / ".claude" / "settings.json").read_text()) == {"theme": "dark",
                                                                          "remoteControlAtStartup": True}


def test_trash_keeps_files_on_their_own_disk(tmp_path):
    home, work = tmp_path / "home", tmp_path / "work" / "proj"
    home.mkdir()
    work.mkdir(parents=True)
    (work / "a.txt").write_text("hi")
    env = {"HOME": str(home), "USER": "me", "PATH": "/usr/bin:/bin"}

    def run(*args):
        return subprocess.run(["bash", str(FILES / "trash"), *args], env=env, capture_output=True, text=True)
    try:
        assert run(str(work / "a.txt")).returncode == 0 and not (work / "a.txt").exists()
        assert "a.txt" in run("--list").stdout
    finally:
        for b in (home / ".trash" / ".bins").read_text().split():
            if b != str(home / ".trash"):
                subprocess.run(["rm", "-rf", b])


def test_settings_go_on_stdin_not_the_command_line(tmp_path, monkeypatch):
    from tests.helpers import LocalShell
    monkeypatch.setenv("HOME", str(tmp_path))
    p = permissions.parse(json.dumps({"env": {"ANTHROPIC_API_KEY": "sk-secret"}}), "")
    assert "sk-secret" not in permissions.save_command(p)  # ps on the login node shows command lines
    permissions.save(LocalShell(), p)
    saved = json.loads((tmp_path / permissions.SETTINGS).read_text())
    assert saved["env"]["ANTHROPIC_API_KEY"] == "sk-secret" and "Bash(trash:*)" in saved["permissions"]["allow"]


def test_settings_written_private(tmp_path, monkeypatch):
    import os
    import stat
    import subprocess as sp

    from tests.helpers import LocalShell
    monkeypatch.setenv("HOME", str(tmp_path))
    (tmp_path / ".claude").mkdir()
    (tmp_path / permissions.SETTINGS).write_text("{}")
    os.chmod(tmp_path / permissions.SETTINGS, 0o644)
    permissions.save(LocalShell(), permissions.parse("{}", ""))
    assert stat.S_IMODE(os.stat(tmp_path / permissions.SETTINGS).st_mode) == 0o600
    sp.run(["bash", "-c", permissions.set_key_command("remoteControlAtStartup", True)], check=True)
    assert stat.S_IMODE(os.stat(tmp_path / permissions.SETTINGS).st_mode) == 0o600


def test_remote_off_turns_off_resumed_chats_too(tmp_path, monkeypatch):
    import subprocess as sp

    from tests.helpers import LocalShell
    monkeypatch.setenv("HOME", str(tmp_path))
    (tmp_path / ".claude").mkdir()
    (tmp_path / permissions.SETTINGS).write_text('{"theme": "dark"}')

    class Shell(LocalShell):
        def run(self, command, timeout=60, fast=None):
            return sp.run(["bash", "-c", command], capture_output=True, text=True, timeout=timeout)
        on_login = run
    permissions.set_remote(Shell(), "remoteControlAtStartup", False)
    s = json.loads((tmp_path / permissions.SETTINGS).read_text())
    assert s == {"theme": "dark", "remoteControlAtStartup": False, "disableRemoteControl": True}
    permissions.set_remote(Shell(), "remoteControlAtStartup", True)
    s = json.loads((tmp_path / permissions.SETTINGS).read_text())
    assert s["remoteControlAtStartup"] is True and s["disableRemoteControl"] is False
