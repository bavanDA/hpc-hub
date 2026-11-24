from hpc_hub.agents import catalog as agents
from hpc_hub.core.config import AgentSettings
from tests.helpers import on_linux_cluster

C = agents.claude_start("claude")  # classic screen, its program read in one go first


def X(line: str) -> str:
    """Codex's line, read in one go first and started again after it updates itself (test_codex_start_*)."""
    return agents.codex_start("codex", line)


def test_claude():
    s = AgentSettings(command="claude")
    assert agents.command(agents.CLAUDE, s) == C + "claude --permission-mode auto"
    s.remote = True
    # the flag too, not only its setting: with the setting alone Claude prints no link to open
    assert agents.command(agents.CLAUDE, s, "abc") == C + "claude --permission-mode auto --remote-control --resume abc"


def test_codex():
    s = AgentSettings(command="codex")
    assert agents.command(agents.CODEX, s) == X("codex --no-daemon")
    assert agents.command(agents.CODEX, s, "01a1") == X("codex resume --no-daemon 01a1")
    s.remote = True
    line = agents.command(agents.CODEX, s)
    assert line.startswith("codex remote-control stop >/dev/null 2>&1; codex remote-control start >/dev/null && echo ")
    assert line.endswith("&& codex remote-control pair --json; " + X("codex --no-daemon"))


def test_agy():
    s = AgentSettings(command="agy", remote=True)
    assert agents.command(agents.AGY, s, "c1") == "agy --remote-control --conversation c1"


def test_cursor():
    s = AgentSettings(command="cursor-agent", model="auto", remote=True)
    assert agents.command(agents.CURSOR, s, "id9") == "cursor-agent --model auto --resume id9"


def test_cluster_has_all_agents():
    from hpc_hub.core.config import ClusterConfig
    c = ClusterConfig(id="x", name="X")
    assert (c.claude.command, c.codex.command, c.agy.command, c.cursor.command) == (
        "claude", "codex", "agy", "cursor-agent")


def test_options_add_flags():
    s = AgentSettings(command="claude", model="opus", mode="plan", effort="high")
    assert agents.command(agents.CLAUDE, s) == C + "claude --model opus --permission-mode plan --effort high"
    c = AgentSettings(command="codex", sandbox="workspace-write", approval="never", effort="xhigh")
    assert agents.command(agents.CODEX, c) == \
        X("codex --no-daemon -s workspace-write -a never -c model_reasoning_effort=xhigh")
    a = AgentSettings(command="agy", mode="auto", sandbox="on")
    assert agents.command(agents.AGY, a) == "agy --mode auto --sandbox"


def test_no_permission_bypass_anywhere():
    for agent in agents.AGENTS:
        for o in agent.options:
            for value, _ in o.choices:
                line = agents.command(agent, AgentSettings(command=agent.id, **{o.key: value}))
                assert "dangerous" not in line and "--force" not in line and "full-access" not in line


def test_option_choices_are_known_values():
    for agent in agents.AGENTS:
        for o in agent.options:
            assert o.choices[0][0] == "", (agent.id, o.key)
            assert hasattr(AgentSettings(), o.key)


def test_task_is_the_first_prompt():
    s = AgentSettings(command="")
    assert agents.command(agents.CLAUDE, s, task="fix it's tests") == \
        C + "claude --permission-mode auto 'fix it'\"'\"'s tests'"
    assert agents.command(agents.CODEX, s, "abc", task="go") == X("codex resume --no-daemon abc go")
    assert agents.command(agents.AGY, s, task="go on") == "agy -i 'go on'"
    assert agents.command(agents.AGY, s, task="  ") == "agy"


def test_claude_runs_with_its_classic_screen():
    """Its output goes to the terminal's scrollback and the mouse stays with the terminal; Claude only."""
    assert agents.command(agents.CLAUDE, AgentSettings(command="claude"), "abc") == \
        C + "claude --permission-mode auto --resume abc"
    assert agents.command(agents.CODEX, AgentSettings(command="codex")) == X("codex --no-daemon")


def test_claude_start_reads_its_program_first(tmp_path):
    import subprocess
    exe = tmp_path / "claude"
    exe.write_text("#!/bin/sh\necho started\n")
    exe.chmod(0o755)
    line = agents.claude_start("claude") + "claude"
    path = {"PATH": f"{tmp_path}:/usr/bin:/bin"}
    out = subprocess.run(["bash", "-c", line], capture_output=True, text=True, env=path)
    assert out.stdout == "Starting Claude...\nstarted\n" and C.startswith(agents.CLAUDE_CLASSIC)
    gone = subprocess.run(["bash", "-c", agents.claude_start("nope") + "echo ran"], capture_output=True, text=True)
    assert gone.stdout.endswith("ran\n")  # not on PATH (an alias): it still starts


def test_claude_starts_in_auto_mode_unless_you_pick_another():
    """Auto is the first choice in the list and what nothing chosen means; Ask before changes is Claude's manual."""
    mode = next(o for o in agents.CLAUDE.options if o.key == "mode")
    assert mode.choices[0] == ("", "Auto")
    assert agents.command(agents.CLAUDE, AgentSettings(command="claude")) == C + "claude --permission-mode auto"
    s = AgentSettings(command="claude", mode="manual")
    assert agents.command(agents.CLAUDE, s) == C + "claude --permission-mode manual"
    assert agents.command(agents.AGY, AgentSettings(command="agy")) == "agy"  # other agents: their own default


# 2026-11-24 report: "codex starting is very slow". Codex updated itself on start, said "Please restart Codex" and
# quit; the tab was left at a shell, and plain `codex` typed there waited on Codex's shared background server
# (unreachable from a compute node) until it gave up. These run the real line in bash with a stand-in codex.
def _codex_home(tmp_path, body: str):
    bin_ = tmp_path / ".local" / "bin"
    bin_.mkdir(parents=True)
    rel = tmp_path / "releases"
    for v in ("1", "2"):
        (rel / v).mkdir(parents=True)
        exe = rel / v / "codex"
        exe.write_text("#!/bin/bash\n" + body.replace("VERSION", v))
        exe.chmod(0o755)
    (bin_ / "codex").symlink_to(rel / "1" / "codex")
    return {"PATH": f"{bin_}:/usr/bin:/bin", "HOME": str(tmp_path), "LOG": str(tmp_path / "log")}


def _run_codex(env, chat_id="", task=""):
    import subprocess
    line = agents.command(agents.CODEX, AgentSettings(command="codex", effort="low"), chat_id, task)
    out = subprocess.run(["bash", "-c", line], env=env, capture_output=True, text=True, timeout=20)
    return out.stdout, open(env["LOG"]).read().splitlines()


@on_linux_cluster
def test_codex_start_again_after_it_updates_itself(tmp_path):
    # version 1 moves the link to version 2 and quits, as Codex's updater does; version 2 just runs
    env = _codex_home(tmp_path, 'echo "VERSION $*" >> "$LOG"\n'
                      '[ VERSION = 1 ] && ln -sfn "$HOME/releases/2/codex" "$HOME/.local/bin/codex" && '
                      'echo "Update ran successfully! Please restart Codex."\nexit 0\n')
    out, log = _run_codex(env, task="go on")
    assert log == ["1 --no-daemon -c model_reasoning_effort=low go on",
                   "2 --no-daemon -c model_reasoning_effort=low go on"]  # the same way: no background server
    assert agents.CODEX_UPDATED in out and out.startswith("Starting Codex...")


@on_linux_cluster
def test_codex_quitting_without_an_update_is_not_started_again(tmp_path):
    env = _codex_home(tmp_path, 'echo "VERSION $*" >> "$LOG"\nexit 1\n')
    out, log = _run_codex(env, "01a1")
    assert log == ["1 resume --no-daemon 01a1 -c model_reasoning_effort=low"]
    assert agents.CODEX_UPDATED not in out


@on_linux_cluster
def test_codex_not_on_path_or_custom_is_started_once(tmp_path):
    env = _codex_home(tmp_path, "")
    env["PATH"] = "/usr/bin:/bin"  # e.g. an alias from a module: nothing to read first or compare
    import subprocess
    line = agents.command(agents.CODEX, AgentSettings(command="codex"))
    out = subprocess.run(["bash", "-c", "codex() { echo ran \"$*\" >> \"$LOG\"; }; " + line], env=env,
                         capture_output=True, text=True, timeout=20)
    assert open(env["LOG"]).read().splitlines() == ["ran --no-daemon"]
    assert agents.CODEX_UPDATED not in out.stdout


def test_codex_program_is_read_in_one_go_first():
    line = agents.command(agents.CODEX, AgentSettings(command="codex"))
    assert line.startswith("{ echo 'Starting Codex...' && { cat \"$(readlink -f \"$(type -P codex)\")\" >/dev/null")


@on_linux_cluster
def test_codex_waits_for_the_folder(tmp_path):
    """The tab runs `cd folder && <line>`: no folder, no Codex."""
    import subprocess
    env = _codex_home(tmp_path, 'echo "VERSION $*" >> "$LOG"\n')
    line = agents.command(agents.CODEX, AgentSettings(command="codex"))
    subprocess.run(["bash", "-c", f"cd {tmp_path}/missing 2>/dev/null && " + line], env=env, timeout=20)
    assert not (tmp_path / "log").exists()
