"""A project from this computer to a cluster, with the Claude chats started in it (projects/from_laptop.py). The
copies report `transfer` events like a copy between clusters, and the project joins your list when its files are
there."""

import os
import posixpath
import shlex
import subprocess

from ...agents import chat_copy
from ...files import remote_fs, transfer
from ...files.status import size_text
from ...projects import from_laptop
from ...projects.store import Project
from ..hub import hub
from ..server import method
from .projects import _add
from .projects_copy import _copying, _error, _Report, _start


def _folder(folder: str) -> str:
    """The folder you picked, checked: a real folder, and not your whole home folder or the disk."""
    path = os.path.abspath(os.path.expanduser(folder.strip())) if folder.strip() else ""
    if not path or not os.path.isdir(path):
        raise ValueError("Pick a folder on this computer")
    home = os.path.realpath(os.path.expanduser("~"))
    if os.path.realpath(path) == home or os.path.dirname(path) == path:
        raise ValueError("Pick a project folder, not your whole home folder")
    return path


@method("projects.local_plan")
def local_plan(folder: str) -> dict:
    """What is in a folder on this computer (biggest first) and the Claude chats started in it. Reads that folder and
    only its own chats."""
    path = _folder(folder)
    out: dict = {"name": os.path.basename(path), "folder": path, "parts": [], "chats": [], "parts_error": "",
                 "chats_error": ""}
    try:
        out["parts"] = [{"name": n, "size": size, "keep": n != ".claude"} for n, size in from_laptop.parts(path)]
    except OSError as e:
        out["parts_error"] = _error(e)
    try:
        out["chats"] = [{"id": c.id, "name": c.name, "size": c.size} for c in from_laptop.chats(path)]
    except OSError as e:
        out["chats_error"] = _error(e)
    return out


def _stream(dst, command: str, write) -> None:
    """Run command on the cluster with write(stdin) feeding it; a failure on either side raises."""
    proc = subprocess.Popen(dst.ssh.argv(command), stdin=subprocess.PIPE, stdout=subprocess.DEVNULL,
                            stderr=subprocess.PIPE)
    try:
        write(proc.stdin)
        proc.stdin.close()
    except (OSError, InterruptedError) as e:
        proc.kill()
        proc.wait()
        if isinstance(e, InterruptedError):
            raise transfer.TransferError("Cancelled") from e
        raise transfer.TransferError(proc.stderr.read().decode(errors="replace").strip() or str(e)) from e
    if proc.wait() != 0:
        err = proc.stderr.read().decode(errors="replace").strip()
        raise transfer.TransferError(err or "Writing on the cluster failed")


def _files(path: str, dst, parent: str, dest: str, skip: list[str], size: int):
    def work(p: transfer.Progress, report: _Report):
        p.total = size
        update = _copying(report)

        def counted(n: int):
            p.done += n
            update(p)
        _stream(dst, transfer.unpack_command(parent),
                lambda out: from_laptop.pack(path, out, skip, counted, p.cancelled.is_set))
        p.finished = True
        try:
            _add(Project(os.path.basename(path), dst.cfg.id, dest, kind="code"))
            report(f"Done · {size_text(p.done)} · now in your projects")
        except ValueError:  # already in the list (copied before)
            report(f"Done · {size_text(p.done)}")
    return work


def _chats(path: str, picked: list[str], dst, dest: str):
    def work(p: transfer.Progress, report: _Report):
        found = [c for c in from_laptop.chats(path) if c.id in picked]
        roots = [os.path.realpath(path), path]
        p.total = sum(c.size for c in found)
        home = remote_fs.home(dst.ssh)
        there = chat_copy.real_path(dst.ssh, dest).rstrip("/")
        for c in found:
            if p.cancelled.is_set():
                raise transfer.TransferError("Cancelled")
            old = next((r for r in roots if c.cwd == r or c.cwd.startswith((r + "/", r + "\\"))), path)
            below = c.cwd[len(old):].replace("\\", "/").strip("/")
            cwd = posixpath.join(there, below) if below else there
            chat_dir = posixpath.join(home, ".claude/projects", chat_copy.project_dir(cwd))
            local = from_laptop.claude_home() / "projects" / c.dir / f"{c.id}.jsonl"
            data = from_laptop.moved_from(local.read_bytes(), old, there)
            target = shlex.quote(f"{chat_dir}/{c.id}.jsonl")
            _stream(dst, f"mkdir -p {shlex.quote(chat_dir)} && cat > {target}.new && mv {target}.new {target}",
                    lambda out, data=data: out.write(data))
            p.done += len(data)
            report("Copying", now=False)
            # its subagents and saved tool output, and its edit history, as a copy between clusters takes them
            rel = posixpath.relpath(chat_dir, home)
            extras = [(str(local.with_suffix("")), f"{rel}/{c.id}"),
                      (str(from_laptop.claude_home() / "file-history" / c.id), f".claude/file-history/{c.id}")]
            if any(os.path.exists(x) for x, _ in extras):
                def counted(n: int):
                    p.done += n
                    report("Copying", now=False)
                _stream(dst, transfer.unpack_command(home),
                        lambda out, extras=extras: from_laptop.pack_paths(extras, out, counted, p.cancelled.is_set))
        p.finished = True
        report(f"Copied {len(found)} chats. Continue them from Claude on {dst.cfg.name}")
    return work


@method("projects.local_copy")
def local_copy(folder: str, to: str, into: str = "~", skip: list[str] | None = None,
               chats: list[str] | None = None) -> dict:
    """Start copying a folder on this computer into a folder on a cluster, leaving out skip (names directly inside
    it), plus the picked Claude chats of it. Answers the transfer ids at once."""
    path = _folder(folder)
    skip = skip or []
    dst = hub().connected(to)
    parent = remote_fs.expand(dst.ssh, into.strip() or "~").rstrip("/") or "/"
    name = os.path.basename(path)
    dest = posixpath.join(parent, name)
    if dst.ssh.run(f"test -e {shlex.quote(dest)}", timeout=30).returncode == 0:
        raise ValueError(f"{dest} already exists on {dst.cfg.short_name}. Pick another folder")
    size = sum(n for part, n in from_laptop.parts(path) if part not in skip)
    files = _start(f"{name}: this computer → {dst.cfg.short_name}:{dest}", _files(path, dst, parent, dest, skip, size))
    talk = _start(f"{len(chats)} Claude chats of {name} → {dst.cfg.short_name}",
                  _chats(path, chats, dst, dest)) if chats else ""
    return {"id": files, "chats": talk}
