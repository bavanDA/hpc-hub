"""Sign in to GitHub with gh from the Papers: the terminal's script for real, with curl and gh standing in (no
network). jdoe and the version 9.9.9 are made up."""

import hashlib
import io
import os
import platform
import subprocess
import tarfile

import pytest

from hpc_hub.api.methods.latex import github
from hpc_hub.api.methods.tools import PATH_LINE
from tests.helpers import GNU_PATH, on_linux_cluster


class FakeSsh:
    def argv(self, command=None, tty=False):
        return ["ssh", "-tt", "jdoe@cluster", command]


class FakeHub:
    def connected(self, cluster):
        return type("S", (), {"ssh": FakeSsh()})()


def test_sign_in_opens_a_terminal_on_the_login_node(monkeypatch):
    monkeypatch.setattr(github, "hub", lambda: FakeHub())
    got = github.gh_sign_in("wulver")
    line = got["argv"][-1]
    assert got["title"] == "Sign in to GitHub" and got["node"] == "" and got["name"].startswith("hpchub-gh-")
    assert "auth login --hostname github.com --git-protocol https --web" in line and "srun" not in line


def test_the_script_never_writes_gits_settings_itself():
    script = github.sign_in_script()
    assert "auth login --hostname github.com --git-protocol https --web" in script
    assert "gh auth setup-git" in script  # said, as an option
    assert "setup-git;" not in script and ".git-credentials" not in script and "git config" not in script
    assert script.endswith("exec bash -l")


FAKE_GH = """#!/bin/sh
echo "$@" >> "$HOME/gh-ran"
"""


def _arch():
    return {"x86_64": "amd64", "amd64": "amd64", "aarch64": "arm64", "arm64": "arm64"}.get(platform.machine(), "")


def _release(tmp_path, good=True):
    """gh 9.9.9's release as curl hands it out: the tarball, its checksums, the API's answer."""
    files, name = tmp_path / "release", f"gh_9.9.9_linux_{_arch()}"
    files.mkdir()
    buf = io.BytesIO()
    with tarfile.open(fileobj=buf, mode="w:gz") as tar:
        data = FAKE_GH.encode()
        info = tarfile.TarInfo(f"{name}/bin/gh")
        info.size, info.mode = len(data), 0o755
        tar.addfile(info, io.BytesIO(data))
    (files / f"{name}.tar.gz").write_bytes(buf.getvalue())
    digest = hashlib.sha256(buf.getvalue() if good else b"something else").hexdigest()
    (files / "sums").write_text(f"{'0' * 64}  gh_9.9.9_linux_386.tar.gz\n{digest}  {name}.tar.gz\n")
    (files / "api").write_text('{"url": "x", "tag_name": "v9.9.9", "name": "GitHub CLI 9.9.9"}\n')
    return files


def _run(tmp_path, files):
    """The script in a home with no gh, and curl handing out files."""
    home, fake, tools = tmp_path / "home", tmp_path / "bin", tmp_path / "tools"
    for d in (home, fake, tools):
        d.mkdir()
    (fake / "curl").write_text(f"""#!/bin/sh
out=""; url=""
while [ $# -gt 0 ]; do case "$1" in -o) out="$2"; shift 2;; -*) shift;; *) url="$1"; shift;; esac; done
case "$url" in
  *api.github.com*) f=api;; *checksums.txt) f=sums;; *.tar.gz) f="${{url##*/}}";; *) exit 22;;
esac
echo "$url" >> "$HOME/curl-asked"
if [ -n "$out" ]; then cp "{files}/$f" "$out"; else cat "{files}/$f"; fi
""")
    (fake / "curl").chmod(0o755)
    for d in GNU_PATH + os.environ.get("PATH", "").split(os.pathsep):  # every tool but gh (CI runners have one)
        if os.path.isdir(d):
            for name in os.listdir(d):
                src = os.path.join(d, name)
                if name not in ("gh", "curl") and not (tools / name).exists() and os.access(src, os.X_OK):
                    (tools / name).symlink_to(src)
    path = f"{fake}:{tools}"
    (home / ".bashrc").write_text(f"export PATH={path}\n")
    script = github.sign_in_script().replace("exec bash -l", "true")
    run = subprocess.run(["bash", "-c", script], env={"HOME": str(home), "PATH": path}, capture_output=True,
                         text=True, timeout=60)
    return home, run


@on_linux_cluster
@pytest.mark.skipif(not _arch(), reason="gh has releases for amd64 and arm64")
def test_the_sign_in_installs_gh_from_its_release_then_signs_in(tmp_path):
    home, run = _run(tmp_path, _release(tmp_path))
    out = run.stdout + run.stderr
    assert "gh 9.9.9 is installed" in out and "Signed in. Go back to the paper" in out, out
    assert (home / ".local/bin/gh").exists()
    assert (home / "gh-ran").read_text().split() == ["auth", "login", "--hostname", "github.com", "--git-protocol",
                                                     "https", "--web"]
    asked = (home / "curl-asked").read_text()
    assert f"github.com/cli/cli/releases/download/v9.9.9/gh_9.9.9_linux_{_arch()}.tar.gz" in asked
    assert PATH_LINE in (home / ".bashrc").read_text()  # a new shell finds gh in ~/.local/bin


@on_linux_cluster
@pytest.mark.skipif(not _arch(), reason="gh has releases for amd64 and arm64")
def test_a_release_that_does_not_match_its_sum(tmp_path):
    home, run = _run(tmp_path, _release(tmp_path, good=False))
    assert "gh did not install" in run.stdout and "Signed in" not in run.stdout
    assert not (home / ".local/bin/gh").exists() and not (home / "gh-ran").exists()
