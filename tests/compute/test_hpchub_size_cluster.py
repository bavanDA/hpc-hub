"""hpchub-size as the cluster runs it: installed in a made-up home folder, with fake sacct and sinfo on PATH, by the
cluster's own python3 (which may be 3.6), apart from the app."""

import ast
import json
import os
import subprocess
from pathlib import Path

import pytest

from hpc_hub.agents import notes
from hpc_hub.compute import job_size

pytestmark = pytest.mark.skipif(os.name != "posix", reason="a make-believe Linux cluster in bash")

SIZING = Path(job_size.__file__).parent / "sizing"


@pytest.mark.parametrize("name", job_size.SOURCES)
def test_runs_on_python_3_6_without_the_app(name):
    text = (SIZING / name).read_text()
    tree = ast.parse(text, feature_version=(3, 6))
    for node in ast.walk(tree):
        if isinstance(node, ast.ImportFrom):
            assert node.level == 0 or all(a.name.startswith("size_") for a in node.names), f"{name}:{node.lineno}"
            assert not (node.module or "").startswith("hpc_hub"), f"{name}:{node.lineno}"
        elif isinstance(node, ast.Import):
            assert not any(a.name.startswith("hpc_hub") for a in node.names), f"{name}:{node.lineno}"
        elif isinstance(node, (ast.AnnAssign, ast.NamedExpr)):
            raise AssertionError(f"{name}:{node.lineno} needs a newer Python")
        elif isinstance(node, (ast.FunctionDef, ast.arg)):
            assert getattr(node, "returns", None) is None and getattr(node, "annotation", None) is None
    for newer in ("capture_output=", "import dataclasses", ".removeprefix(", ".removesuffix(", "text=True"):
        assert newer not in text, f"{name} uses {newer}"


def test_the_spec_ships_them():
    spec = (SIZING.parents[2] / "packaging" / "backend.spec").read_text()
    assert '"compute" / "sizing"' in spec


def _home(tmp_path):
    home, bin_ = tmp_path / "home", tmp_path / "bin"
    proj = home / "proj"
    proj.mkdir(parents=True)
    bin_.mkdir()
    sacct = (f"1001|train|COMPLETED|01:00:00|02:00:00|16|256G||1||n0042|general|{proj}|sbatch run.sh\n"
             "1001.batch|batch|COMPLETED|01:00:00|01:59:59|16||36000000K|1|1|n0042|||\n")
    (bin_ / "sacct").write_text(f"#!/bin/sh\necho \"$@\" >> {tmp_path}/sacct.log\ncat <<'EOF'\n{sacct}EOF\n")
    (bin_ / "sinfo").write_text("#!/bin/sh\ncase \"$*\" in *%N*) echo 'n0042|128';; "
                                "*) echo 'general*|128|512000';; esac\n")
    for f in bin_.iterdir():
        f.chmod(0o755)
    (proj / "run.sh").write_text("#!/bin/bash\n#SBATCH --mem=256G\n#SBATCH --cpus-per-task=16\npython train.py\n")
    env = {**os.environ, "HOME": str(home), "USER": "jdoe", "PATH": f"{bin_}:{os.environ['PATH']}"}
    return home, proj, env


def _sh(command, env, cwd=None):
    res = subprocess.run(["bash", "-c", command], env=env, cwd=cwd, capture_output=True, text=True, timeout=60)
    assert res.returncode == 0, res.stderr
    return res.stdout


def test_installed_it_measures_and_advises(tmp_path):
    home, proj, env = _home(tmp_path)
    _sh(job_size.install_line(), env)
    tool = home / ".local/bin/hpchub-size"
    assert os.access(tool, os.X_OK) and (home / ".hpc-hub/size/size_measure.py").exists()
    when = tool.stat().st_mtime_ns
    _sh(job_size.install_line(), env)
    assert tool.stat().st_mtime_ns == when  # nothing changed: nothing written

    out = _sh(f"{tool} run.sh", env, cwd=proj)
    assert "Suggested: --mem=42G --cpus-per-task=3 --time=01:30:00" in out and "Warning: Asks for 256 GB" in out
    store = json.loads((home / ".hpc-hub/job-sizes.json").read_text())
    assert list(store["kinds"]) == [f"{proj}/run.sh"] and store["since"] > 0
    rep = json.loads(_sh(f"{tool} --json --mem=40G run.sh", env, cwd=proj))
    assert rep["asked"]["mem_mb"] == 40 * 1024 and [x["kind"] for x in rep["advice"]] == ["cores"]
    assert "n0042" not in _sh(f"{tool}", env) and "34 GB" in _sh(f"{tool}", env)  # the jobs measured lately
    assert "Job 1001: COMPLETED" in _sh(f"{tool} --job 1001", env)


def test_the_app_checks_the_text_in_its_editor(tmp_path):
    home, proj, env = _home(tmp_path)
    text = "#!/bin/bash\n#SBATCH --mem=42G\n#SBATCH --cpus-per-task=3\npython train.py\n"
    rep = json.loads(_sh(job_size.check_command(str(proj / "run.sh"), text), env).splitlines()[-1])
    assert rep["match"] == "same" and rep["advice"] == []
    rep = json.loads(_sh(job_size.check_command("~/proj/run.sh"), env).splitlines()[-1])
    assert [x["label"] for x in rep["advice"]] == ["Use 42 GB", "Use 3 cores"]


def test_the_note_goes_where_each_agent_reads_it_once(tmp_path):
    home, _, env = _home(tmp_path)
    (home / ".claude").mkdir()
    (home / ".codex").mkdir()
    (home / ".claude/CLAUDE.md").write_text("# Mine\nKeep this.")
    _sh(notes.write_command(), env)
    claude = (home / ".claude/CLAUDE.md").read_text()
    assert claude.startswith("# Mine\nKeep this.\n\n" + notes.BEGIN) and "hpchub-size" in claude
    assert notes.JOB_SIZE in (home / ".codex/AGENTS.md").read_text()
    assert not (home / ".gemini").exists()  # Antigravity was never used here

    _sh(notes.write_command("# Slurm job size\nNewer words.\n"), env)
    claude = (home / ".claude/CLAUDE.md").read_text()
    assert claude.count(notes.BEGIN) == 1 and "Newer words." in claude and "Keep this." in claude

    (home / ".claude/CLAUDE.md").write_text("# Mine\nKeep this.\n")  # you took it out
    _sh(notes.write_command(), env)
    assert (home / ".claude/CLAUDE.md").read_text() == "# Mine\nKeep this.\n"
