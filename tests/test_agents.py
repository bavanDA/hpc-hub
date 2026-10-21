from hpc_hub import agents
from hpc_hub.config import AgentSettings


def test_claude():
    s = AgentSettings(command="claude")
    assert agents.command(agents.CLAUDE, s) == "claude"
    s.remote = True
    assert agents.command(agents.CLAUDE, s, "abc") == "claude --resume abc"  # remote control is a setting


def test_codex():
    s = AgentSettings(command="codex")
    assert agents.command(agents.CODEX, s) == "codex --no-daemon"
    assert agents.command(agents.CODEX, s, "01a1") == "codex resume --no-daemon 01a1"
    s.remote = True
    line = agents.command(agents.CODEX, s)
    assert line.startswith("codex remote-control stop >/dev/null 2>&1; codex remote-control start >/dev/null && echo ")
    assert line.endswith("&& codex remote-control pair --json; codex --no-daemon")


def test_agy():
    s = AgentSettings(command="agy", remote=True)
    assert agents.command(agents.AGY, s, "c1") == "agy --remote-control --conversation c1"


def test_cursor():
    s = AgentSettings(command="cursor-agent", model="auto", remote=True)
    assert agents.command(agents.CURSOR, s, "id9") == "cursor-agent --model auto --resume id9"


def test_cluster_has_all_agents():
    from hpc_hub.config import ClusterConfig
    c = ClusterConfig(id="x", name="X")
    assert (c.claude.command, c.codex.command, c.agy.command, c.cursor.command) == (
        "claude", "codex", "agy", "cursor-agent")


def test_options_add_flags():
    s = AgentSettings(command="claude", model="opus", mode="plan", effort="high")
    assert agents.command(agents.CLAUDE, s) == "claude --model opus --permission-mode plan --effort high"
    c = AgentSettings(command="codex", sandbox="workspace-write", approval="never", effort="xhigh")
    assert agents.command(agents.CODEX, c) == \
        "codex --no-daemon -s workspace-write -a never -c model_reasoning_effort=xhigh"
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
    assert agents.command(agents.CLAUDE, s, task="fix it's tests") == "claude 'fix it'\"'\"'s tests'"
    assert agents.command(agents.CODEX, s, "abc", task="go") == "codex resume --no-daemon abc go"
    assert agents.command(agents.AGY, s, task="go on") == "agy -i 'go on'"
    assert agents.command(agents.AGY, s, task="  ") == "agy"
