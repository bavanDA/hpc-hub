"""The Chat view of a Claude tab: the same running Claude as the terminal, shown as a conversation.

Claude writes each conversation to ~/.claude/projects/<folder>/<session id>.jsonl as it goes. HPC Hub starts it with
--session-id (catalog.command), and the tab's tmux name ends in the id's first 8 characters
(hpchub-claude-<job>-<tag>), so the file is found from the tab alone. It is read from where the last read stopped, a
bounded piece at a time; the first read takes only the end of a long chat.

What waits on you (a permission question, a menu) isn't in the file: it is read from the pane's screen
(parse_screen), and answered with keys (KEYS)."""

import base64
import json
import re
import shlex

from ..core.ssh import SshMaster
from ..terminals import tmux

READ_MAX = 800_000  # bytes read at once; the first read shows this much of a long chat's end
STRING_MAX = 12_000  # characters kept of any one string (a file's whole text, a long command output)
TAG = re.compile(r"^hpchub-claude-\d*-?([0-9a-f]{8})$")

# Runs on the cluster (python3 3.6+). argv[1]: base64 JSON {tag, file, offset, since}. Prints one JSON object.
SCRIPT = r'''
import base64, glob, json, os, sys
a = json.loads(base64.b64decode(sys.argv[1]).decode())
READ_MAX, STRING_MAX = int(sys.argv[2]), int(sys.argv[3])
root = os.path.realpath(os.path.expanduser("~/.claude/projects"))
def ours(p):
    r = os.path.realpath(p)
    return r.startswith(root + os.sep) and r.endswith(".jsonl")
def shrink(v):
    if isinstance(v, str):
        return v if len(v) <= STRING_MAX else v[:STRING_MAX] + "\n[%d more characters]" % (len(v) - STRING_MAX)
    if isinstance(v, list):
        return [shrink(x) for x in v]
    if isinstance(v, dict):
        return dict((k, shrink(x)) for k, x in v.items())
    return v
path = os.path.expanduser(a.get("file") or "")
if path and not ours(path):
    path = ""
if not path and a.get("tag"):
    found = [p for p in glob.glob(os.path.join(root, "*", a["tag"] + "*.jsonl")) if ours(p)]
    found.sort(key=os.path.getmtime)
    path = found[-1] if found else ""
offset = int(a.get("offset", -1))
if path and a.get("since"):  # after /clear or /resume Claude writes a new file in the same folder
    newer = [p for p in glob.glob(os.path.join(os.path.dirname(path), "*.jsonl"))
             if p != path and ours(p) and os.path.getmtime(p) >= a["since"]]
    if newer:
        newer.sort(key=os.path.getmtime)
        path, offset = newer[-1], 0
if not path:
    print(json.dumps({"waiting": True}))
    sys.exit(0)
size = os.path.getsize(path)
start, trimmed, reset = offset, False, False
if offset < 0:  # the first read: only the end of a long chat
    start = max(0, size - READ_MAX)
    trimmed = start > 0
elif offset > size:  # a different file now: from its start
    start, reset = 0, True
with open(path, "rb") as f:
    f.seek(start)
    data = f.read(min(READ_MAX, size - start))
skip = 0
if trimmed:  # begin at a whole line
    cut = data.find(b"\n")
    skip = cut + 1 if cut >= 0 else len(data)
end = data.rfind(b"\n")  # and stop after one: a line still being written comes next time
done = end + 1 if end >= skip else skip
body = data[skip:done]
lines = []
for raw in body.decode("utf-8", "replace").splitlines():
    try:
        lines.append(shrink(json.loads(raw)))
    except ValueError:
        pass
home = os.path.expanduser("~")
shown = path.replace(home, "~", 1) if path.startswith(home + os.sep) else path
print(json.dumps({"file": shown, "offset": start + done, "size": size, "trimmed": trimmed, "reset": reset,
                  "lines": lines}))
'''


def tag_of(session: str) -> str:
    """The session id's first 8 characters, from a Claude tab's tmux name; "" for other tabs."""
    m = TAG.match(session)
    return m.group(1) if m else ""


def read_command(tag: str, file: str = "", offset: int = -1, since: float = 0) -> str:
    args = base64.b64encode(json.dumps({"tag": tag, "file": file, "offset": offset, "since": since}).encode()).decode()
    return f"python3 -c {shlex.quote(SCRIPT)} {args} {READ_MAX} {STRING_MAX}"


# -- the conversation, as the Chat view shows it --------------------------------------------------------

def _text(content) -> str:
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        return "\n".join(b.get("text", "") for b in content if isinstance(b, dict) and b.get("type") == "text")
    return ""


COMMAND = re.compile(r"<command-name>(.*?)</command-name>", re.S)
ARGS = re.compile(r"<command-args>(.*?)</command-args>", re.S)
STDOUT = re.compile(r"<local-command-stdout>(.*?)</local-command-stdout>", re.S)
ANSI = re.compile(r"\x1b\[[0-9;]*[A-Za-z]")


def events(lines: list[dict]) -> list[dict]:
    """Claude's conversation lines as the view's items: user and assistant text, tool calls and their results,
    slash commands and notes. Thinking, bookkeeping and Claude's own reminders are left out."""
    out: list[dict] = []
    for d in lines:
        if not isinstance(d, dict):
            continue
        kind, uid = d.get("type"), str(d.get("uuid") or len(out))
        msg = d.get("message") if isinstance(d.get("message"), dict) else {}
        if kind == "system" and d.get("subtype") == "compact_boundary":
            out.append({"kind": "note", "id": uid, "text": "The conversation was compacted"})
        if kind == "user":
            if d.get("isCompactSummary"):
                out.append({"kind": "note", "id": uid, "text": "Earlier messages were summarized"})
                continue
            content = msg.get("content")
            if isinstance(content, list):
                for i, b in enumerate(content):
                    if isinstance(b, dict) and b.get("type") == "tool_result":
                        out.append({"kind": "result", "id": f"{uid}-{i}", "tool": b.get("tool_use_id", ""),
                                    "text": ANSI.sub("", _text(b.get("content"))), "error": bool(b.get("is_error"))})
            if d.get("isMeta"):
                continue
            text = _text(content).strip()
            if not text or text.startswith("Caveat:"):
                continue
            if m := COMMAND.search(text):
                args = ARGS.search(text)
                said = " ".join(x for x in (m.group(1), args.group(1) if args else "") if x.strip())
                out.append({"kind": "command", "id": uid, "text": said.strip()})
            elif m := STDOUT.search(text):
                said = ANSI.sub("", m.group(1)).strip()
                if said:
                    out.append({"kind": "note", "id": uid, "text": said})
            elif not text.startswith("<"):
                out.append({"kind": "user", "id": uid, "text": text})
        elif kind == "assistant":
            content = msg.get("content")
            for i, b in enumerate(content if isinstance(content, list) else []):
                if not isinstance(b, dict):
                    continue
                if b.get("type") == "text" and b.get("text", "").strip():
                    out.append({"kind": "text", "id": f"{uid}-{i}", "text": b["text"].strip()})
                elif b.get("type") == "tool_use":
                    out.append({"kind": "tool", "id": b.get("id") or f"{uid}-{i}", "name": b.get("name", ""),
                                "input": b.get("input") if isinstance(b.get("input"), dict) else {}})
    return out


def read(ssh: SshMaster, session: str, file: str = "", offset: int = -1, since: float = 0) -> dict:
    tag = tag_of(session)
    if not tag and not file:
        return {"waiting": True, "unknown": True}
    res = ssh.run(read_command(tag, file, offset, since), timeout=60)
    try:
        data = json.loads(res.stdout.strip().splitlines()[-1])
    except (ValueError, IndexError):
        raise RuntimeError(res.stderr.strip().splitlines()[-1] if res.stderr.strip() else "Could not read the chat")
    if data.get("waiting"):
        return {"waiting": True}
    lines = data.get("lines") or []
    cwd = next((d["cwd"] for d in reversed(lines) if isinstance(d, dict) and isinstance(d.get("cwd"), str)), "")
    return {"file": data["file"], "offset": data["offset"], "size": data["size"], "trimmed": data["trimmed"],
            "reset": data.get("reset", False), "cwd": cwd, "events": events(lines)}


# -- what waits on you, from the screen -----------------------------------------------------------------

OPTION = re.compile(r"^[\s│|]*([❯›]\s*)?(\d)\.\s+(.+?)\s*[│|]?\s*$")
BOX = " │|─╭╮╰╯╌┄┈"  # frames and dividers around Claude's questions, never part of what they say
POINTED = re.compile(r"^(\s*)❯ (\S.*)$")


def _arrow_menu(lines: list[str]) -> tuple[list[dict], int | None]:
    """A menu without numbers ("❯ No, exit / Yes, I trust this folder"): its choices in a column, ❯ on the picked
    one, and "Enter to confirm" under them. Each choice's key moves to it and presses Enter (move:+1, move:-2).
    Your own message echoed in the history ("❯ fix the plot") has neither neighbours nor that line."""
    bottom = lines[-40:]
    start = len(lines) - len(bottom)
    for i, ln in enumerate(bottom):
        m = POINTED.match(ln)
        if not m:
            continue
        indent = len(m.group(1)) + 2
        top = i
        while top > 0 and bottom[top - 1].startswith(" " * indent) and bottom[top - 1].strip() \
                and not bottom[top - 1].startswith(" " * (indent + 1)):
            top -= 1
        end = i + 1
        while end < len(bottom) and bottom[end].startswith(" " * indent) and bottom[end].strip() \
                and not bottom[end].startswith(" " * (indent + 1)):
            end += 1
        below = " ".join(bottom[end:end + 3]).lower()
        if end - top < 2 or "enter to confirm" not in below:
            continue
        options = [{"key": f"move:{j - i:+d}", "label": ("".join(bottom[j][indent:]) if j != i else m.group(2)).strip()}
                   for j in range(top, end)]
        return options, start + top
    return [], None
MODES = (("accept edits", "edits"), ("plan mode", "plan"), ("auto mode", "auto"), ("bypass permissions", "auto"),
         ("don't ask", "auto"))


def parse_screen(text: str) -> dict:
    """The pane as plain text: busy (Claude is working), mode (ask, edits, plan or auto, from the footer), and
    ask: a question with numbered choices waiting for an answer ({question, detail, options: [{key, label}]})."""
    lines = [ln.rstrip() for ln in text.splitlines()]
    # a Claude that draws from the top of the pane leaves empty rows under its footer (a short conversation): the
    # footer is the last row with something on it, not the pane's last row (2026-11-19 report: the mode never read)
    while lines and not lines[-1].strip():
        lines.pop()
    tail = "\n".join(lines[-6:]).lower()
    mode = next((m for words, m in MODES if words in tail and "on" in tail), "ask")
    busy = "esc to interrupt" in tail
    ask = None
    options: list[dict] = []
    first, marked = None, False
    for i, ln in enumerate(lines[-40:]):  # a menu sits at the bottom of the screen
        i += max(0, len(lines) - 40)
        m = OPTION.match(ln)
        if m and int(m.group(2)) == len(options) + 1:
            if not options:
                first = i
            options.append({"key": m.group(2), "label": m.group(3).strip()})
            marked = marked or bool(m.group(1))
        elif m and m.group(2) == "1":  # a new list starts
            first, marked = i, bool(m.group(1))
            options = [{"key": "1", "label": m.group(3).strip()}]
        elif options and ln.strip(" │|─╭╮╰╯") and not ln.startswith(("   ", "│  ")):
            if len(options) >= 2 and marked:
                break
            options, first, marked = [], None, False
        elif options and ln.strip(" │|─╭╮╰╯"):  # a choice's text going on to the next line
            options[-1]["label"] += " " + ln.strip(" │|")
    # only a real menu: Claude marks the picked choice with ❯ (a numbered list in its answer has no mark)
    if not (len(options) >= 2 and marked and first is not None):
        options, first = _arrow_menu(lines)
    if len(options) >= 2 and first is not None:
        above = [ln.strip(BOX) for ln in lines[max(0, first - 12):first]]
        above = [ln for ln in above if ln]
        q = next((i for i in range(len(above) - 1, -1, -1) if above[i].endswith("?")), None)
        if q is None:  # "Is this a project you trust? (Like your own code…)": the question sits inside the line
            q = next((i for i in range(len(above) - 1, -1, -1) if "?" in above[i]), None)
        question = above[q] if q is not None else (above[-1] if above else "Claude is waiting for a choice")
        detail = "\n".join(ln for ln in (above[:q] if q is not None else above[:-1]) if ln.strip(BOX))[-1500:]
        ask = {"question": question, "detail": detail, "options": options,
               "permission": question.lower().startswith("do you want")}
    return {"busy": busy and not ask, "mode": mode, "ask": ask}


def screen_command(session: str, node: str = "") -> str:
    return tmux.on(node, f"tmux capture-pane -p -t {shlex.quote(session + ':')} 2>/dev/null")


def screen(ssh: SshMaster, session: str, node: str = "") -> dict:
    res = ssh.on_login(screen_command(session, node), timeout=20)
    if res.returncode != 0 and not res.stdout:
        return {"gone": True, "busy": False, "mode": "ask", "ask": None}
    return parse_screen(res.stdout)


# keys the view may press: an answer's number, Escape (stop Claude, or say no), Enter, Shift+Tab (next mode)
KEYS = {**{str(n): str(n) for n in range(1, 10)}, "escape": "Escape", "enter": "Enter", "mode": "BTab"}


MOVE = re.compile(r"^move:([+-]\d)$")


def key_command(session: str, key: str, node: str = "") -> str:
    """The keys for an answer: a number, Escape, Enter, Shift+Tab, or move:+N (down N choices, then Enter)."""
    move = MOVE.match(key)
    if move:
        n = int(move.group(1))
        keys = " ".join(["Down" if n > 0 else "Up"] * abs(n) + ["Enter"])
    elif key in KEYS:
        keys = KEYS[key]
    else:
        raise ValueError(f"Not a key the chat sends: {key}")
    return tmux.on(node, f"tmux send-keys -t {shlex.quote(session + ':')} {keys}")
