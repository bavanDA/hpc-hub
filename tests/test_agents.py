from hpc_hub import agents
from hpc_hub.config import AgentSettings


def test_claude():
    s = AgentSettings(command="claude", skip_permissions=True)
    assert agents.command(agents.CLAUDE, s) == "claude --dangerously-skip-permissions"
    s.remote = True
    assert agents.command(agents.CLAUDE, s, "abc") == \
        "claude --dangerously-skip-permissions --remote-control --resume abc"


def test_codex():
    s = AgentSettings(command="codex")
    assert agents.command(agents.CODEX, s) == "codex"
    s.skip_permissions = True
    assert agents.command(agents.CODEX, s, "01a1") == "codex resume 01a1 --dangerously-bypass-approvals-and-sandbox"
    s.remote, s.skip_permissions = True, False
    line = agents.command(agents.CODEX, s)
    assert line.startswith("codex remote-control start >/dev/null && echo ")
    assert line.endswith("&& codex remote-control pair --json; codex")


def test_agy():
    s = AgentSettings(command="agy", remote=True)
    assert agents.command(agents.AGY, s, "c1") == "agy --remote-control --conversation c1"


def test_cluster_has_all_agents():
    from hpc_hub.config import ClusterConfig
    c = ClusterConfig(id="x", name="X")
    assert (c.claude.command, c.codex.command, c.agy.command) == ("claude", "codex", "agy")
