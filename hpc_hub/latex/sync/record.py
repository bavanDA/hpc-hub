"""Where a safe push stands, kept in <git dir>/hpc-hub/sync.json so closing the app in between loses nothing."""

import json
import posixpath
import shlex

from ...core.ssh import SshMaster
from ...files import remote_fs
from ..git_shell import SEP, g, parts, run

ORIG, ASIDE = "refs/hpc-hub/sync/orig", "refs/hpc-hub/sync/aside"


def where(ssh: SshMaster, folder: str) -> tuple[str, str]:
    p = parts(run(ssh, f"{g(folder)} rev-parse --show-toplevel; echo {SEP}; {g(folder)} rev-parse --absolute-git-dir"),
              2)
    return p[0].strip(), p[1].strip()


def state_path(gitdir: str) -> str:
    return posixpath.join(gitdir, "hpc-hub", "sync.json")


def load(ssh: SshMaster, folder: str) -> dict | None:
    _, gitdir = where(ssh, folder)
    res = ssh.run(f"cat {shlex.quote(state_path(gitdir))}", timeout=30)
    if res.returncode != 0 or not res.stdout.strip():
        return None
    return json.loads(res.stdout)


def save(ssh: SshMaster, st: dict) -> None:
    path = state_path(st["git_dir"])
    run(ssh, f"mkdir -p {shlex.quote(posixpath.dirname(path))}")
    remote_fs.write_bytes(ssh, path, json.dumps(st).encode())


def clear(ssh: SshMaster, st: dict) -> None:
    G = g(st["root"])
    ssh.run(f"{G} update-ref -d {ORIG}; {G} update-ref -d {ASIDE}; rm -f {shlex.quote(state_path(st['git_dir']))}",
            timeout=30)
