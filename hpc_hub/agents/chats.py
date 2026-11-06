"""Past agent chats on a cluster, newest first: Claude, Codex and Antigravity."""

import json
import shlex
from dataclasses import dataclass

from ..core.ssh import SshMaster

LIMIT = 60

# Runs on the cluster (python3 3.6+). Reads only the head and tail of each chat file.
SCRIPT = r'''
import glob, json, os, sys
CHUNK = 262144
def chunk(f, size, end):
    if end:
        f.seek(max(0, size - CHUNK))
    return f.read(CHUNK).decode("utf-8", "replace").splitlines()
def tree(p):
    total = 0
    for root, _, names in os.walk(p):
        for n in names:
            try:
                total += os.lstat(os.path.join(root, n)).st_size
            except OSError:
                pass
    return total
def text(c):
    if isinstance(c, list):
        c = " ".join(b.get("text", "") for b in c if isinstance(b, dict) and b.get("type") == "text")
    return c.strip() if isinstance(c, str) else ""
def claude(limit):
    files = glob.glob(os.path.expanduser("~/.claude/projects/*/*.jsonl"))
    files.sort(key=lambda p: os.path.getmtime(p), reverse=True)
    out = []
    for path in files[:limit]:
        st = os.stat(path)
        cid = os.path.basename(path)[:-6]
        # size: the conversation, its subagents and saved tool output, and its edit history
        size = st.st_size
        if FULL:  # slow on some home file systems (7 s on Wulver): only when copying needs it
            size += tree(path[:-6]) + tree(os.path.expanduser("~/.claude/file-history/" + cid))
        chat = {"id": cid, "mtime": int(st.st_mtime), "size": size, "cwd": "", "first": "", "title": "",
                "last": "", "dir": os.path.basename(os.path.dirname(path))}
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
    return out
def codex(limit):
    names = {}
    try:
        for line in open(os.path.expanduser("~/.codex/session_index.jsonl"), errors="replace"):
            try:
                d = json.loads(line)
            except ValueError:
                continue
            if d.get("id"):
                names[d["id"]] = d.get("thread_name") or names.get(d["id"], "")
    except OSError:
        pass
    files = glob.glob(os.path.expanduser("~/.codex/sessions/*/*/*/rollout-*.jsonl"))
    files.sort(key=lambda p: os.path.getmtime(p), reverse=True)
    out = []
    for path in files[:limit]:
        st = os.stat(path)
        cid = os.path.basename(path)[-42:-6]
        chat = {"id": cid, "mtime": int(st.st_mtime), "size": st.st_size, "cwd": "", "first": "",
                "title": names.get(cid, ""), "last": ""}
        try:
            with open(path, "rb") as f:
                for line in chunk(f, st.st_size, False):
                    if chat["cwd"] and chat["first"]:
                        break
                    if '"session_meta"' not in line and '"user_message"' not in line:
                        continue
                    try:
                        d = json.loads(line)
                    except ValueError:
                        continue
                    p = d.get("payload") or {}
                    if d.get("type") == "session_meta":
                        chat["cwd"] = p.get("cwd", "")
                    elif p.get("type") == "user_message" and not chat["first"]:
                        chat["first"] = text(p.get("message"))[:300]
        except OSError:
            continue
        if chat["first"] or chat["title"]:
            out.append(chat)
    return out
def agy(limit):
    import calendar, sqlite3, time
    db = os.path.expanduser("~/.gemini/antigravity-cli/conversation_summaries.db")
    if not os.path.exists(db):
        return []
    con = sqlite3.connect("file:" + db + "?mode=ro", uri=True)
    rows = con.execute("select conversation_id, title, preview, last_modified_time, workspace_uris "
                       "from conversation_summaries where parent_conversation_id = '' "
                       "order by last_modified_time desc limit ?", (limit,)).fetchall()
    out = []
    for cid, title, preview, when, uris in rows:
        try:
            ws = json.loads(uris or "[]")
        except ValueError:
            ws = []
        cwd = ws[0][7:] if ws and ws[0].startswith("file://") else ""
        try:
            mtime = calendar.timegm(time.strptime(when[:19], "%Y-%m-%d %H:%M:%S"))
        except ValueError:
            mtime = 0
        out.append({"id": cid, "mtime": mtime, "size": 0, "cwd": cwd, "first": (preview or "")[:300],
                    "title": title or "", "last": ""})
    return out
try:
    FULL = len(sys.argv) > 3 and sys.argv[3] == "full"
    out = {"claude": claude, "codex": codex, "agy": agy}.get(sys.argv[1], lambda n: [])(int(sys.argv[2]))
except Exception as e:
    sys.stderr.write("%s\n" % e)
    out = []
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
    dir: str = ""  # Claude: its folder under ~/.claude/projects

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


def command(agent: str = "claude", limit: int = LIMIT, full_size: bool = False) -> str:
    """full_size: add the chat's subagents, saved tool output and edit history to its size (for copying)."""
    return f"python3 -c {shlex.quote(SCRIPT)} {shlex.quote(agent)} {int(limit)}" + (" full" if full_size else "")


def list_chats(ssh: SshMaster, agent: str = "claude", limit: int = LIMIT, full_size: bool = False) -> list[Chat]:
    res = ssh.run(command(agent, limit, full_size), timeout=60)
    if res.returncode != 0:
        raise RuntimeError(res.stderr.strip().splitlines()[-1] if res.stderr.strip() else "Could not list chats")
    return parse(res.stdout)
