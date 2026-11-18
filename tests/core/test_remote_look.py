from hpc_hub.core import remote


def test_an_npm_agent_without_node_cannot_start():
    out = "@t=file\n@l=#!/usr/bin/env node\n@node=\n"
    assert remote.parse_look(out) == remote.Command("file", "node", "")


def test_its_own_installers_copy_runs_instead():
    out = "@t=file\n@l=#!/usr/bin/env node\n@node=\n@native=/home/jdoe/.local/bin/codex\n"
    assert remote.parse_look(out).native == "/home/jdoe/.local/bin/codex"


def test_with_node_or_a_program_all_is_well():
    assert remote.parse_look("@t=file\n@l=#!/usr/bin/env node\n@node=/usr/bin/node\n") == remote.Command("file")
    assert remote.parse_look("@t=file\n@l=\x7fELF\n@node=\n") == remote.Command("file")
    assert remote.parse_look("@t=file\n@l=#!/usr/bin/env python3\n@node=\n") == remote.Command("file")
    assert remote.parse_look("@t=alias\n@node=\n") == remote.Command("alias")
    assert remote.parse_look("@t=\n@node=\n") == remote.Command("")


def test_the_look_runs_in_bash(tmp_path, monkeypatch):
    """The script itself, on this computer: a node script with no node, and a program beside it in ~/.local/bin."""
    import subprocess
    home, other = tmp_path / "home", tmp_path / "npm" / "bin"
    (home / ".local" / "bin").mkdir(parents=True)
    other.mkdir(parents=True)
    (other / "agentx").write_text("#!/usr/bin/env node\n")
    (home / ".local" / "bin" / "agentx").write_bytes(b"\x7fELF")
    for f in (other / "agentx", home / ".local" / "bin" / "agentx"):
        f.chmod(0o755)
    script = remote._LOOK.replace("{n}", "agentx")
    env = {"HOME": str(home), "PATH": f"{other}:/usr/bin:/bin"}
    out = subprocess.run(["bash", "-c", script], capture_output=True, text=True, env=env).stdout
    got = remote.parse_look(out)
    if got.kind == "file" and not got.needs:  # this computer has node on /usr/bin: nothing more to see
        return
    assert got == remote.Command("file", "node", str(home / ".local" / "bin" / "agentx"))
