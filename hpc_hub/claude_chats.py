"""Past Claude Code chats on a cluster (~/.claude/projects/*/*.jsonl), newest first."""

import json
import shlex
from dataclasses import dataclass

from .ssh import SshMaster

LIMIT = 60

# Runs on the cluster (python3 3.6+). Reads only the head and tail of each chat file.
SCRIPT = r'''
import glob, json, os, sys
CHUNK = 262144
def chunk(f, size, end):
    if end:
        f.seek(max(0, size - CHUNK))
    return f.read(CHUNK).decode("utf-8", "replace").splitlines()
def text(c):
    if isinstance(c, list):
        c = " ".join(b.get("text", "") for b in c if isinstance(b, dict) and b.get("type") == "text")
    return c.strip() if isinstance(c, str) else ""
files = glob.glob(os.path.expanduser("~/.claude/projects/*/*.jsonl"))
files.sort(key=lambda p: os.path.getmtime(p), reverse=True)
out = []
for path in files[:int(sys.argv[1])]:
    st = os.stat(path)
    chat = {"id": os.path.basename(path)[:-6], "mtime": int(st.st_mtime), "size": st.st_size,
            "cwd": "", "first": "", "title": "", "last": ""}
    try:
        with open(path, "rb") as f:
            for line in chunk(f, st.st_size, False):
                if chat["cwd"] and chat["first"]:
                    break
                if '"cwd"' not in line and '"user"' not in line:
                    continue
                try:
                    d = json.loads(line)
                except ValueError:
                    continue
                chat["cwd"] = chat["cwd"] or d.get("cwd", "")
                if d.get("type") == "user" and not d.get("isMeta") and not chat["first"]:
                    t = text((d.get("message") or {}).get("content"))
                    if t and not t.startswith(("<", "Caveat:")):
                        chat["first"] = t[:300]
            for line in chunk(f, st.st_size, True):
                if "-title" not in line and "last-prompt" not in line:
                    continue
                try:
                    d = json.loads(line)
                except ValueError:
                    continue
                kind = d.get("type")
                if kind == "custom-title":
                    chat["custom"] = d.get("customTitle", "")
                elif kind == "ai-title":
                    chat["title"] = d.get("aiTitle", "")
                elif kind == "last-prompt":
                    chat["last"] = (d.get("lastPrompt") or "")[:300]
    except OSError:
        continue
    chat["title"] = chat.pop("custom", "") or chat["title"]
    if chat["first"] or chat["title"] or chat["last"]:
        out.append(chat)
print(json.dumps(out))
'''


@dataclass
class Chat:
    id: str
    cwd: str
    title: str
    first: str
    last: str
    mtime: int
    size: int

    @property
    def name(self) -> str:
        return " ".join((self.title or self.first or self.last or self.id).split())


def parse(text: str) -> list[Chat]:
    try:
        data = json.loads(text.strip().splitlines()[-1]) if text.strip() else []
    except ValueError:
        return []
    keys = Chat.__dataclass_fields__
    return [Chat(**{k: d.get(k, 0 if k in ("mtime", "size") else "") for k in keys})
            for d in data if isinstance(d, dict) and d.get("id")]


def command(limit: int = LIMIT) -> str:
    return f"python3 -c {shlex.quote(SCRIPT)} {int(limit)}"


def list_chats(ssh: SshMaster, limit: int = LIMIT) -> list[Chat]:
    res = ssh.run(command(limit), timeout=60)
    if res.returncode != 0:
        raise RuntimeError(res.stderr.strip().splitlines()[-1] if res.stderr.strip() else "Could not list chats")
    return parse(res.stdout)
