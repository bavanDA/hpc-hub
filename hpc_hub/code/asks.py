"""Ask an agent about a piece of code, once, on the cluster (docs/design/code.md, "AI-friendly part").

Each ask runs one agent headless (agents/ask_all.headless) from a bash script in its own tmux session on the
compute node, so it outlives the app and the phone's screen. Everything lives in ~/.hpc-hub/asks/<id>/:
meta.json (what was asked), state, prompt.md, run.sh, log, answer.md, proposed/<path> (full new versions of the
files the agent would change, paths relative to the repository root) and snapshot/<path> (those files as they
were, the base of each proposal).

The agent is told to propose, never to edit. If it edits the repository anyway, the script turns that edit into
a proposal and puts the file back, so the folder on the cluster only changes when you accept and save.
"""

import base64
import hashlib
import io
import json
import posixpath
import re
import secrets
import shlex
import tarfile
import time
from dataclasses import asdict, dataclass, field

ROOT = ".hpc-hub/asks"  # under $HOME
SESSION_PREFIX = "hpchub-ask-"
KINDS = ("explain", "fix", "test", "free")
STATES = ("starting", "waiting_for_node", "running", "done", "failed", "cancelled")
ID = re.compile(r"^\d{8}-\d{6}-[0-9a-f]{4}$")
MAX_ERROR = 20_000  # characters of error text put in the prompt
MAX_RESULT = 20 * 1024 * 1024  # bytes of results fetched back


@dataclass
class Ask:
    id: str
    agent: str  # catalog id
    agent_name: str
    kind: str
    path: str  # the file, as the user gave it (~/x or /abs)
    question: str = ""
    error_text: str = ""
    from_line: int = 0  # 1-based, inclusive; 0 = the whole file
    to_line: int = 0
    node: str = ""
    started: float = field(default_factory=time.time)

    @property
    def folder(self) -> str:
        return f"~/{ROOT}/{self.id}"

    @property
    def session(self) -> str:
        return SESSION_PREFIX + self.id

    def meta(self) -> dict:
        return {k: v for k, v in asdict(self).items() if k not in ("question", "error_text")}


def new_id(now: float | None = None) -> str:
    return time.strftime("%Y%m%d-%H%M%S", time.localtime(now)) + "-" + secrets.token_hex(2)


def check_id(ask_id: str) -> str:
    if not ID.match(ask_id or ""):
        raise ValueError("That ask id looks wrong")
    return ask_id


def where(a: Ask) -> str:
    """'train.py, lines 40 to 58' / 'train.py'."""
    name = posixpath.basename(a.path.rstrip("/")) or a.path
    if a.from_line and a.to_line and a.to_line != a.from_line:
        return f"{name}, lines {a.from_line} to {a.to_line}"
    if a.from_line:
        return f"{name}, line {a.from_line}"
    return name


def prompt(a: Ask) -> str:
    """What the agent reads. $OUT, $REL and $ROOT are filled in by the script (it only knows them on the node)."""
    focus = where(a)
    task = {
        "explain": f"Explain what {focus} does, for someone who did not write it. Plain words, short.",
        "fix": f"Find why this error happens and fix it. Start from {focus}.",
        "test": f"Write a test for {focus}. Use the test framework the repository already uses, else pytest "
                f"for Python. Run the test if you can.",
        "free": "",
    }[a.kind]
    parts = [task] if task else []
    if a.question.strip():
        parts.append(a.question.strip())
    if a.kind == "fix" and a.error_text.strip():
        err = a.error_text.strip()[-MAX_ERROR:]
        parts.append(f"The error:\n\n```\n{err}\n```")
    lines = "the whole file" if not a.from_line else (
        f"lines {a.from_line} to {a.to_line or a.from_line}")
    parts.append(
        "---\n"
        f"The file is $REL in the repository at $ROOT (look at {lines}). You may read anything in the repository "
        "and run commands that only read or test.\n"
        "Do not change any file in the repository. If you would change files, write the complete new version of "
        "each one to $OUT/proposed/<its path relative to the repository root>, new files too. The person reviews "
        "those and decides.\n"
        "Write your answer to $OUT/answer.md: short, plain Markdown, written for the person. Say what you changed "
        "and why, if anything."
    )
    return "\n\n".join(parts) + "\n"


def _b64(text: str) -> str:
    return base64.b64encode(text.encode()).decode()


def _path_word(path: str) -> str:
    """The file as a shell word: ~ and ~/x expand, everything else is quoted."""
    path = path.strip()
    if path == "~":
        return '"$HOME"'
    if path.startswith("~/"):
        return f'"$HOME"/{shlex.quote(path[2:])}'
    return shlex.quote(path)


def script(a: Ask, agent_cmd: str) -> str:
    """The bash script run.sh. agent_cmd runs the agent once with the prompt in "$OUT/prompt.md"
    (ask_all.headless with that file); it may use $OUT."""
    out = f'"$HOME"/{ROOT}/{a.id}'
    return "\n".join([
        "set -u",
        f"OUT={out}",
        'mkdir -p "$OUT/proposed" "$OUT/snapshot"',
        'state() { printf %s "$1" > "$OUT/state.tmp" && mv -f "$OUT/state.tmp" "$OUT/state"; }',
        f"FILE={_path_word(a.path)}",
        'DIR=$(dirname -- "$FILE")',
        'ROOT=$(git -C "$DIR" rev-parse --show-toplevel 2>/dev/null) || ROOT=$(cd -- "$DIR" 2>/dev/null && pwd -P)',
        'if [ -z "$ROOT" ]; then echo "Folder not found: $DIR" > "$OUT/log"; state failed; exit 1; fi',
        'ABS=$(cd -- "$DIR" && pwd -P)/$(basename -- "$FILE")',
        'REL=${ABS#"$ROOT"/}',
        'export OUT ROOT REL',
        'printf %s "$ROOT" > "$OUT/root"',
        'cd "$ROOT" || { state failed; exit 1; }',
        # the file as it was: the base for the proposal, and what the safety net puts back
        '[ -f "$ABS" ] && mkdir -p "$OUT/snapshot/$(dirname -- "$REL")" && cp -p -- "$ABS" "$OUT/snapshot/$REL"',
        'GIT=0; git rev-parse --is-inside-work-tree >/dev/null 2>&1 && GIT=1',
        'if [ $GIT = 1 ]; then git status --porcelain --untracked-files=all -z > "$OUT/.before"; fi',
        f'P=$(printf %s {_b64(prompt(a))} | base64 -d)',
        r'P=${P//\$OUT/$OUT}; P=${P//\$ROOT/$ROOT}; P=${P//\$REL/$REL}',
        'printf "%s\\n" "$P" > "$OUT/prompt.md"',
        '[ -f "$OUT/cancelled" ] && { state cancelled; exit 0; }',
        'state running',
        # its own process group, so cancel stops the agent and everything it started, and this script goes on
        'S=; command -v setsid > /dev/null && S=setsid',
        f'$S bash -c {shlex.quote(agent_cmd)} > "$OUT/log" 2>&1 < /dev/null &',
        'echo $! > "$OUT/pid"; wait $!; rc=$?',
        # safety net 1: the asked file was edited in place
        'if [ -f "$OUT/snapshot/$REL" ] && ! cmp -s "$OUT/snapshot/$REL" "$ABS"; then',
        '  if [ ! -e "$OUT/proposed/$REL" ]; then mkdir -p "$OUT/proposed/$(dirname -- "$REL")"; '
        'cp -p -- "$ABS" "$OUT/proposed/$REL"; fi',
        '  cp -p -- "$OUT/snapshot/$REL" "$ABS"; echo "$REL" >> "$OUT/put_back"',
        'fi',
        # safety net 2: other files in a git repository, only ones that were clean before (so HEAD is what they were)
        'if [ $GIT = 1 ]; then',
        '  git status --porcelain --untracked-files=all -z > "$OUT/.after"',
        '  tr "\\0" "\\n" < "$OUT/.before" | cut -c4- | sort -u > "$OUT/.b"',
        '  tr "\\0" "\\n" < "$OUT/.after" | sort -u | while IFS= read -r line; do',
        '    [ -n "$line" ] || continue; code=${line:0:2}; f=${line:3}',
        '    [ "$f" = "$REL" ] && continue',
        '    grep -Fxq -- "$f" "$OUT/.b" && continue',
        '    case "$f" in .hpc-hub/*) continue ;; esac',
        '    mkdir -p "$OUT/proposed/$(dirname -- "$f")"',
        '    [ -e "$OUT/proposed/$f" ] || cp -p -- "$f" "$OUT/proposed/$f" 2>/dev/null',
        '    if [ "$code" = "??" ]; then rm -f -- "$f"',
        '    else mkdir -p "$OUT/snapshot/$(dirname -- "$f")"; git show "HEAD:$f" > "$OUT/snapshot/$f" 2>/dev/null '
        '&& cp -- "$OUT/snapshot/$f" "$f"; fi',
        '    echo "$f" >> "$OUT/put_back"',
        '  done',
        'fi',
        '[ -s "$OUT/answer.md" ] || tail -c 20000 "$OUT/log" > "$OUT/answer.md"',
        '[ -f "$OUT/cancelled" ] && { state cancelled; exit 0; }',
        'if [ $rc = 0 ]; then state done; else state failed; fi',
        "",
    ])


def start_command(a: Ask, run_sh: str, tmux_line: str) -> str:
    """One shell line for the login node: make the folder, write meta.json, prompt is in run.sh, then tmux_line
    (which starts `bash run.sh` in tmux on the node)."""
    out = f'"$HOME"/{ROOT}/{a.id}'
    return (f"mkdir -p {out} && printf %s {_b64(json.dumps(a.meta()))} | base64 -d > {out}/meta.json && "
            f"printf %s {_b64(run_sh)} | base64 -d > {out}/run.sh && printf starting > {out}/state && "
            f"{tmux_line}")


def run_line(a: Ask) -> str:
    return f'bash "$HOME"/{ROOT}/{a.id}/run.sh'


def set_state_command(ask_id: str, state: str) -> str:
    out = f'"$HOME"/{ROOT}/{check_id(ask_id)}'
    return f"[ -d {out} ] && printf %s {shlex.quote(state)} > {out}/state"


def cancel_command(ask_id: str) -> str:
    """Run where the ask runs (its node): mark it cancelled and stop the agent. run.sh then puts back any file
    the agent touched and ends as cancelled."""
    out = f'"$HOME"/{ROOT}/{check_id(ask_id)}'
    return (f"[ -d {out} ] || exit 0; touch {out}/cancelled; p=$(cat {out}/pid 2>/dev/null); "
            f"if [ -n \"$p\" ]; then kill -TERM -- -\"$p\" 2>/dev/null || kill -TERM \"$p\" 2>/dev/null; "
            f"else printf cancelled > {out}/state; fi; true")


# -- reading back ---------------------------------------------------------------------------------------------------
LIST_SEP = "\x1e"


def list_command(limit: int = 30, ask_id: str = "") -> str:
    """meta.json and state of the newest asks (or only ask_id), separated by LIST_SEP."""
    pick = f"echo {check_id(ask_id)}/" if ask_id else f"ls -1d */ 2>/dev/null | sort -r | head -n {int(limit)}"
    return (f'cd "$HOME"/{ROOT} 2>/dev/null && {pick} | '
            f"while read -r d; do d=${{d%/}}; [ -f \"$d/meta.json\" ] || continue; cat \"$d/meta.json\"; "
            f"printf '\\n{LIST_SEP}'; cat \"$d/state\" 2>/dev/null; echo; "
            f"tail -n 1 \"$d/log\" 2>/dev/null | cut -c1-200; "
            f"printf '\\n{LIST_SEP}\\n'; done")


@dataclass
class Status:
    id: str
    state: str
    kind: str
    agent: str
    path: str
    started: float
    detail: str


def detail(state: str, agent_name: str, path: str, last_line: str = "") -> str:
    name = posixpath.basename(path.rstrip("/")) or path
    return {
        "starting": "Starting",
        "waiting_for_node": "Waiting for a node",
        "running": f"{agent_name} is reading {name}",
        "done": "Answer ready",
        "failed": f"Didn't finish: {last_line}" if last_line.strip() else "Didn't finish",
        "cancelled": "Stopped",
    }.get(state, state)


def status_of(meta: dict, state: str, last_line: str = "") -> Status:
    state = state.strip() if state.strip() in STATES else "failed"
    return Status(meta.get("id", ""), state, meta.get("kind", "free"), meta.get("agent", ""), meta.get("path", ""),
                  float(meta.get("started", 0)), detail(state, meta.get("agent_name", "The agent"),
                                                        meta.get("path", ""), last_line.strip()))


def parse_list(text: str) -> list[Status]:
    out, parts = [], text.split(LIST_SEP)
    for i in range(0, len(parts) - 1, 2):
        try:
            meta = json.loads(parts[i].strip())
        except ValueError:
            continue
        state, _, last = parts[i + 1].lstrip("\n").partition("\n")
        out.append(status_of(meta, state, last if state.strip() == "failed" else ""))
    return out


def fetch_command(ask_id: str) -> str:
    """Everything an answer needs, as a base64 tar of the ask's folder (no run.sh, no git lists)."""
    out = f'"$HOME"/{ROOT}/{check_id(ask_id)}'
    return (f"cd {out} && tar -cz --exclude=run.sh --exclude=.before --exclude=.after --exclude=.b "
            f"--exclude=state.tmp . 2>/dev/null | head -c {MAX_RESULT} | base64 | tr -d '\\n'")


@dataclass
class Proposed:
    path: str
    base_sha: str
    original: str
    proposed: str
    is_new: bool


@dataclass
class Result:
    id: str
    answer: str
    files: list[Proposed]
    chat_id: str
    put_back: list[str]  # files the agent changed in place, put back as they were (shown as proposals)
    state: str


def _text(data: bytes) -> str | None:
    try:
        return data.decode()
    except UnicodeDecodeError:
        return None


def chat_id_from_log(log: str) -> tuple[str, str]:
    """(session id, result text) from `claude -p --output-format json`'s output, else ('', '')."""
    for chunk in (log.strip(), log.strip().splitlines()[-1] if log.strip() else ""):
        try:
            data = json.loads(chunk)
        except ValueError:
            continue
        if isinstance(data, dict):
            sid = str(data.get("session_id", ""))
            return (sid if re.match(r"^[A-Za-z0-9_-]{1,80}$", sid) else ""), str(data.get("result", ""))
    return "", ""


def parse_result(ask_id: str, b64: str) -> Result:
    files: dict[str, bytes] = {}
    with tarfile.open(fileobj=io.BytesIO(base64.b64decode(b64 or "")), mode="r:gz") as tar:
        for m in tar.getmembers():
            if m.isfile():
                f = tar.extractfile(m)
                if f:
                    files[posixpath.normpath(m.name).lstrip("./")] = f.read()
    root = (_text(files.get("root", b"")) or "").strip()
    log = _text(files.get("log", b"")) or ""
    chat_id, result_text = chat_id_from_log(log)
    answer = (_text(files.get("answer.md", b"")) or "").strip()
    if result_text and (not answer or log.strip().endswith(answer)):
        answer = result_text.strip()  # Claude printed JSON and wrote no answer.md: its result is the answer
    proposed = []
    for name, data in sorted(files.items()):
        if not name.startswith("proposed/"):
            continue
        rel = name[len("proposed/"):]
        new_text = _text(data)
        if new_text is None or not rel or ".." in rel.split("/"):
            continue
        base = files.get("snapshot/" + rel)
        old = _text(base) if base is not None else ""
        if old is None or old == new_text:
            continue
        proposed.append(Proposed(posixpath.join(root, rel) if root else rel,
                                 hashlib.sha256(base).hexdigest() if base is not None else "",
                                 old, new_text, base is None))
    put_back = [x for x in (_text(files.get("put_back", b"")) or "").splitlines() if x]
    state = (_text(files.get("state", b"")) or "").strip()
    return Result(check_id(ask_id), answer, proposed, chat_id, put_back, state)
