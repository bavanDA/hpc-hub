"""A stand-in cluster for the backup agent: the local bash with HOME, scratch and project in a temp folder, and
sbatch, squeue and scancel stand-ins on PATH (sbatch runs the job script right away, in its folder)."""

import os
import subprocess
import time
from pathlib import Path

import pytest

DAY = 86400

SBATCH = r"""#!/bin/bash
# sbatch stand-in: --parsable SCRIPT runs SCRIPT now in this folder and prints a job id.
echo "$*" >> "$FAKE_SBATCH_LOG"
for a in "$@"; do case $a in --begin=*|--export=*HPCHUB_RESUBMIT*) echo 4242; exit 0;; esac; done
script="${@: -1}"
bash "$script" > /dev/null 2>&1
echo 4242
"""
RSYNC = r"""#!/bin/bash
# rsync stand-in: the real one, slow at the start when SLOW_RSYNC is set (to stop a copy halfway)
for a in "$@"; do case $a in --info=progress2*) [ -n "${SLOW_RSYNC:-}" ] && sleep 30;; esac; done
exec /usr/bin/rsync "$@"
"""


class Cluster:
    """Runs 'remote' commands in the local bash with the fake HOME and PATH."""

    def __init__(self, root: Path):
        self.root = root
        self.home = root / "home"
        self.scratch = root / "scratch" / "jdoe"
        self.project = root / "project" / "mygroup" / "jdoe"
        self.bin = root / "bin"
        for d in (self.home, self.scratch, self.project, self.bin):
            d.mkdir(parents=True)
        for name, text in (("sbatch", SBATCH), ("rsync", RSYNC), ("squeue", "#!/bin/bash\n"),
                           ("scancel", "#!/bin/bash\n")):
            (self.bin / name).write_text(text)
            (self.bin / name).chmod(0o755)
        self.env = {**os.environ, "HOME": str(self.home), "PATH": f"{self.bin}:{os.environ['PATH']}",
                    "FAKE_SBATCH_LOG": str(root / "sbatch.log")}

    def run(self, command, timeout=120, fast=None):
        return subprocess.run(["bash", "-c", command], capture_output=True, text=True, timeout=timeout,
                              env=self.env)

    def argv(self, command, tty=False):
        return ["bash", "-c", command]


def put(path: Path, data: bytes = b"x", days_old: float = 0) -> Path:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(data)
    if days_old:
        t = time.time() - days_old * DAY
        os.utime(path, (t, t))  # test setup only: HPC Hub itself never changes dates
    return path


@pytest.fixture
def cluster(tmp_path):
    return Cluster(tmp_path)


@pytest.fixture
def tree(cluster):
    return make_tree(cluster)


def make_tree(cluster):
    """A scratch tree with results, code, regenerable files, checkpoints, a git repo, links and odd names."""
    s = cluster.scratch
    put(s / "runs/sweep/results/table.csv", b"a,b\n1,2\n" * 100, 40)
    put(s / "runs/sweep/results/plot.png", b"\x89PNG" + b"0" * 500, 40)
    put(s / "runs/sweep/train.py", b"print('hi')\n", 40)
    put(s / "runs/sweep/ckpt_epoch1.pt", b"1" * 300, 45)
    put(s / "runs/sweep/ckpt_epoch2.pt", b"2" * 300, 42)
    put(s / "runs/sweep/ckpt_epoch3.pt", b"3" * 300, 41)
    put(s / "runs/sweep/__pycache__/train.cpython-312.pyc", b"pyc", 40)
    put(s / "runs/sweep/new_today.csv", b"fresh", 0)  # not at risk
    put(s / "proj/.git/config", b"[core]\n", 40)
    put(s / "proj/main.c", b"int main(){}\n", 40)
    put(s / "proj/-rf", b"odd", 40)
    put(s / "proj/new\nline.txt", b"odd", 40)
    put(s / "proj/tab\tname.csv", b"1,2\n", 40)
    put(s / "proj/résumé.md", b"# notes\n", 40)
    with open(s / "proj/sparse.bin", "wb") as fh:
        fh.truncate(4 << 20)
    t = time.time() - 40 * DAY
    os.utime(s / "proj/sparse.bin", (t, t))
    os.link(s / "proj/main.c", s / "proj/main_link.c")
    os.symlink("main.c", s / "proj/inside_link")
    os.symlink("/etc/hostname", s / "proj/outside_link")
    os.symlink("nowhere", s / "proj/dangling_link")
    for link in ("inside_link", "outside_link", "dangling_link"):
        os.utime(s / "proj" / link, (t, t), follow_symlinks=False)
    return s


def snapshot(root: Path) -> dict:
    """Everything about scratch the backup must never change (atime aside: reading a file may set it)."""
    out = {}
    for dirpath, dirnames, filenames in os.walk(root):
        for name in dirnames + filenames:
            p = os.path.join(dirpath, name)
            st = os.lstat(p)
            out[os.path.relpath(p, root)] = (st.st_size, st.st_mtime_ns, st.st_ctime_ns, st.st_ino, st.st_mode)
    return out
