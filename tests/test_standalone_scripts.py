"""Files the packaged app ships as source and runs alone (packaging/backend.spec): openconnect, ssh and the voice's
own Python start them by path, where hpc_hub can't be imported. One of them importing it broke the VPN sign-in."""

import ast
from pathlib import Path

import pytest

PKG = Path(__file__).resolve().parent.parent / "hpc_hub"
ALONE = ["connect/sso.py", "connect/askpass.py", "pdf/readaloud/worker.py", "pdf/readaloud/words_worker.py"]


@pytest.mark.parametrize("name", ALONE)
def test_runs_without_the_app(name):
    tree = ast.parse((PKG / name).read_text())
    for node in ast.walk(tree):
        if isinstance(node, ast.ImportFrom):
            assert node.level == 0 and not (node.module or "").startswith("hpc_hub"), f"{name}:{node.lineno}"
        elif isinstance(node, ast.Import):
            assert not any(a.name.startswith("hpc_hub") for a in node.names), f"{name}:{node.lineno}"


def test_the_spec_ships_them_as_source():
    spec = (PKG.parent / "packaging" / "backend.spec").read_text()
    for name in ALONE:
        assert Path(name).name in spec
