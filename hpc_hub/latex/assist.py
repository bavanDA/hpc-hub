"""The agent's help with a paper's history: Write message, Ask about a change and Check my list.

Each is one headless call of the agent you picked (Claude Haiku with Low effort unless you change it) on your
compute node, with everything it needs in the prompt: no tools and no files to read, so a small change takes
seconds. Here: the choice (the agent is picked in Settings, its model and effort in the paper, any of each), the
prompts (the diff trimmed to a sane size), the script that runs the agent, and reading its answer back. The agent
never commits and never checks a note off: the app shows what it says and you decide."""

import base64
import json
import re
import shlex
from dataclasses import dataclass

from ..agents.catalog import AGENTS, AGY, BY_ID, CLAUDE, CODEX, CURSOR, Agent

DIFF_LIMIT = 24_000  # characters of diff in one prompt
FILE_LIMIT = 8_000  # of one file's part of it
CONTEXT_LINES = 12  # around the lines a question is about
SUBJECTS = 12  # recent commit subjects, for the style
TIMEOUT = 900  # seconds the agent may take
RUN_ROOT = ".hpc-hub/paper-agent"  # under $HOME: the prompt and run.sh while a job runs
MARK = "@@hpchub-answer@@"  # what the agent printed starts after this line (a login shell may print first)
ID_RE = re.compile(r"^[0-9a-f]{6,32}$")


# -- the choice ----------------------------------------------------------------------------------------------------
@dataclass(frozen=True)
class Choice:
    agent: str = "claude"
    model: str = ""
    effort: str = ""


def _option(agent: Agent, key: str):
    return next((o for o in agent.options if o.key == key), None)


def _choices(agent: Agent, key: str) -> list[list[str]]:
    o = _option(agent, key)
    return [[v, label] for v, label in o.choices] if o else []


def describe() -> list[dict]:
    """What each agent offers: {id, name, models: [[value, label]], efforts: [[value, label]]}."""
    return [{"id": a.id, "name": a.name, "models": _choices(a, "model"), "efforts": _choices(a, "effort")}
            for a in AGENTS]


def check(agent: str, model: str = "", effort: str = "") -> Choice:
    """A choice the agent understands; a model or effort it has no setting for is dropped."""
    a = BY_ID.get(agent)
    if not a:
        raise ValueError(f"No agent {agent}")
    out = {}
    for key, value in (("model", model or ""), ("effort", effort or "")):
        o = _option(a, key)
        if not o:
            out[key] = ""
            continue
        if value not in {v for v, _ in o.choices}:
            raise ValueError(f"{a.name} has no {o.label.lower()} {value}")
        out[key] = value
    return Choice(a.id, out["model"], out["effort"])


DEFAULT = Choice("claude", "haiku", "low")


def switch(c: Choice, agent: str) -> Choice:
    """Another agent (picked in Settings): the model and effort carry over when it has them; Claude starts at Haiku,
    Low again, the others at their default model and Low effort where they have effort."""
    a = BY_ID.get(agent)
    if not a:
        raise ValueError(f"No agent {agent}")
    if a.id == c.agent:
        return c
    start = DEFAULT if a is CLAUDE else Choice(a.id, "", "low")
    out = {}
    for key in ("model", "effort"):
        o = _option(a, key)
        have = {v for v, _ in o.choices} if o else set()
        now, first = getattr(c, key), getattr(start, key)
        out[key] = now if now and now in have else first if first in have else ""
    return Choice(a.id, out["model"], out["effort"])


def label(c: Choice) -> str:
    """'Claude Haiku, Low' / 'ChatGPT, Medium' / 'Cursor Auto'."""
    a = BY_ID[c.agent]
    name = dict(_option(a, "model").choices).get(c.model, c.model) if c.model and _option(a, "model") else ""
    effort = dict(_option(a, "effort").choices).get(c.effort, c.effort) if c.effort and _option(a, "effort") else ""
    return f"{a.name}{' ' + name if name else ''}{', ' + effort if effort else ''}"


# -- the diff, trimmed ---------------------------------------------------------------------------------------------
def _file_head(f: dict) -> str:
    extra = {"A": " (new file)", "D": " (deleted)",
             "R": f" (renamed from {f.get('old_path', '')})"}.get(f["status"], "")
    return f"--- {f['path']}{extra}{' (binary)' if f.get('binary') else ''}"


def diff_text(changes: dict, limit: int = DIFF_LIMIT, file_limit: int = FILE_LIMIT) -> str:
    """A plain unified diff from history.changes, each file and the whole trimmed at a line, saying what was left
    out. Lines that moved show once, where they went."""
    out: list[str] = []
    size, left = 0, []
    for f in changes.get("files", []):
        rows = [_file_head(f)]
        for h in f.get("hunks", []):
            rows.append(f"@@ -{h['old']} +{h['new']} @@ {h.get('header', '')}".rstrip())
            rows += [f"{r['k']}{r['t']}" for r in h["rows"] if not r.get("src")]
        text = _cut(rows, file_limit, "of this file")
        if size + len(text) > limit and out:
            left.append(f["path"])
            continue
        text = _cut(text.split("\n"), limit - size, "of the change")
        out.append(text)
        size += len(text) + 1
    if left:
        out.append(f"[Also changed, not shown: {', '.join(left)}]")
    return "\n".join(out)


def _cut(rows: list[str], limit: int, what: str) -> str:
    kept, n = [], 0
    for i, r in enumerate(rows):
        if n + len(r) + 1 > limit and kept:
            kept.append(f"[{len(rows) - i} more lines {what} left out]")
            break
        kept.append(r)
        n += len(r) + 1
    return "\n".join(kept)


def numbered(text: str, line: int, end: int, around: int = CONTEXT_LINES) -> str:
    """The lines line..end of a file with some around them, each with its number ("  23| ...")."""
    rows = text.split("\n")
    a, b = max(1, line - around), min(len(rows), max(line, end) + around)
    return "\n".join(f"{n:5d}| {rows[n - 1]}" for n in range(a, b + 1))


# -- Write message -------------------------------------------------------------------------------------------------
def message_prompt(diff: str, files: list[dict], subjects: list[str], split: bool) -> str:
    """files: [{path, added, removed, new}] (git_state's changes)."""
    listed = "\n".join(f"- {f['path']} +{f.get('added', 0)} -{f.get('removed', 0)}{' (new)' if f.get('new') else ''}"
                       for f in files)
    style = "\n".join(f"- {s}" for s in subjects[:SUBJECTS]) or "- (none yet)"
    shape = '{"subject": "...", "body": "..."}'
    rules = [
        "Subject: one line, at most 72 characters, plain words that say what changed in the paper, like "
        "\"Fix the constant in Lemma 2\". No period at the end.",
        "Body: one to three short sentences on why, only when the change shows a reason. Otherwise an empty string.",
        "Match the style of the recent subjects.",
    ]
    if split and len(files) > 1:
        rules.append("If the change holds clearly separate changes in different files, you may split it into 2 to 4 "
                     "commits. Every file goes in exactly one commit. Do not split one change that belongs together.")
        shape = ('{"subject": "...", "body": "...", "commits": [{"files": ["path", "..."], "subject": "...", '
                 '"body": "..."}]}\n("commits" only when you split; subject and body then describe it all as one '
                 "commit.)")
    return ("Write a git commit message for this change to a LaTeX paper.\n\n"
            + "\n".join(f"- {r}" for r in rules)
            + f"\n- Answer with JSON only, no other text:\n{shape}\n\n"
            f"Recent subjects:\n{style}\n\nFiles:\n{listed}\n\nDiff:\n{diff}\n")


def _json(text: str) -> dict | None:
    """The JSON object in an answer, also inside ``` fences or after a sentence."""
    t = text.strip()
    a, b = t.find("{"), t.rfind("}")
    if a < 0 or b <= a:
        return None
    try:
        d = json.loads(t[a:b + 1])
    except ValueError:
        return None
    return d if isinstance(d, dict) else None


def _subject(s: str) -> str:
    s = " ".join(str(s).strip().split("\n")[0].split())
    s = s.strip("`\"' ")
    s = re.sub(r"^(subject|summary|title)\s*:\s*", "", s, flags=re.I)
    return s.rstrip(".").strip()


def _body(s: object) -> str:
    if not isinstance(s, str):
        return ""
    return "\n".join(line.rstrip() for line in s.strip().split("\n")).strip()


def _split(raw: object, paths: list[str]) -> list[dict]:
    """The suggested commits, cleaned: known files only, each once, the ones it forgot go to the last commit.
    [] unless at least two commits are left."""
    if not isinstance(raw, list) or len(raw) < 2:
        return []
    by_name: dict[str, str] = {}
    for p in paths:
        by_name.setdefault(p.rsplit("/", 1)[-1], p)
    seen: set[str] = set()
    out = []
    for c in raw:
        if not isinstance(c, dict) or not _subject(c.get("subject", "")):
            continue
        files = []
        for f in c.get("files") or []:
            p = f if f in paths else by_name.get(str(f).rsplit("/", 1)[-1], "") if isinstance(f, str) else ""
            if p and p not in seen:
                seen.add(p)
                files.append(p)
        if files:
            out.append({"subject": _subject(c["subject"]), "body": _body(c.get("body")), "files": files})
    if len(out) < 2:
        return []
    out[-1]["files"] += [p for p in paths if p not in seen]
    return out


def parse_message(text: str, paths: list[str]) -> dict:
    """{subject, body, commits: [{subject, body, files}]} from the agent's answer (JSON, or plain text: the first
    line is the subject)."""
    d = _json(text)
    if d and isinstance(d.get("subject"), str) and _subject(d["subject"]):
        return {"subject": _subject(d["subject"]), "body": _body(d.get("body")),
                "commits": _split(d.get("commits"), paths)}
    rows = [r for r in text.strip().split("\n") if not r.strip().startswith("```")]
    while rows and not _subject(rows[0]):
        rows.pop(0)
    if not rows:
        raise ValueError("The agent answered without a message")
    body = "\n".join(rows[1:])
    return {"subject": _subject(rows[0]), "body": _body(re.sub(r"^\s*body\s*:\s*", "", body, flags=re.I)),
            "commits": []}


# -- Ask about a change --------------------------------------------------------------------------------------------
CITE_RE = re.compile(r"\[\[\s*(?:(?:page|p\.)\s*(\d+)|([^\[\]\n:]+?):(\d+)(?:\s*[-–]\s*(\d+))?)\s*\]\]", re.I)
ASK_RULES = ("Answer in a few short sentences, plainly, for a researcher. When you point at a line, write it as "
             "[[path:line]] or [[path:first-last]], with the path exactly as given below; a page of the PDF as "
             "[[page N]]. Use no other kind of link. If the material below does not answer the question, say so.")


def ask_prompt(question: str, about: str, material: str) -> str:
    """about: one line on what is asked about; material: the diff, lines or commit it is about."""
    return (f"An author of a LaTeX paper asks about a change in its git history.\n\n{ASK_RULES}\n\n"
            f"The question is about: {about}\n\n{material.strip()}\n\nQuestion: {question.strip()}\n")


def parse_answer(text: str) -> dict:
    """{text, cites: [{ref, path, line, end, page}]}; ref is the [[...]] as it stands in text."""
    t = "\n".join(r for r in text.strip().split("\n") if not r.strip().startswith("```")).strip()
    if not t:
        raise ValueError("The agent answered nothing")
    cites = []
    for m in CITE_RE.finditer(t):
        page, path, line, end = m.group(1), m.group(2), m.group(3), m.group(4)
        cites.append({"ref": m.group(0), "path": (path or "").strip(), "line": int(line or 0),
                      "end": int(end or line or 0), "page": int(page or 0)})
    return {"text": t, "cites": cites}


# -- Check my list -------------------------------------------------------------------------------------------------
VERDICTS = ("done", "not_yet", "unsure")


def _place(p: dict | None) -> str:
    if not p:
        return ""
    if p.get("path"):
        return f" (about {p['path']} line {p.get('line', 0)})"
    if p.get("page"):
        return f" (about page {p['page']} of the PDF)"
    if p.get("hash"):
        return f" (about commit {str(p['hash'])[:7]})"
    return ""


def check_prompt(notes: list[dict], diff: str) -> str:
    listed = "\n".join(f"- id {n['id']}: {json.dumps(n['text'])}{_place(n.get('place'))}" for n in notes)
    return ("Below are open notes (comments and to-dos) on a LaTeX paper, and the author's changes not committed "
            "yet. For each note, say whether the changes do what it asks.\n\n"
            "- verdict \"done\": the changes clearly do it. \"not_yet\": they do not, or only in part. \"unsure\": "
            "the changes do not show it either way.\n"
            "- reason: one short sentence. Point at the evidence as [[path:line]] (new line numbers) when there is "
            "some, and give that path and line.\n"
            "- Never say done without evidence in the changes.\n"
            "- Answer with JSON only, no other text:\n"
            '{"notes": [{"id": "...", "verdict": "done", "reason": "...", "path": "", "line": 0}]}\n\n'
            f"Notes:\n{listed}\n\nChanges:\n{diff}\n")


def parse_check(text: str, notes: list[dict]) -> list[dict]:
    """One result per note, in the notes' order: {id, verdict, reason, path, line}. A note the agent skipped, or
    an answer that is not JSON, is unsure."""
    d = _json(text) or {}
    got = {}
    for r in d.get("notes") or []:
        if isinstance(r, dict) and str(r.get("id", "")) and str(r.get("id")) not in got:
            got[str(r["id"])] = r
    out = []
    for n in notes:
        r = got.get(n["id"], {})
        verdict = str(r.get("verdict", "")).lower().replace(" ", "_").replace("-", "_")
        line = r.get("line")
        out.append({"id": n["id"], "verdict": verdict if verdict in VERDICTS else "unsure",
                    "reason": " ".join(str(r.get("reason") or "").split()) or "The agent did not say.",
                    "path": str(r.get("path") or "").strip(),
                    "line": line if isinstance(line, int) and line > 0 else 0})
    return out


# -- running it on the node ----------------------------------------------------------------------------------------
def check_id(job_id: str) -> str:
    if not ID_RE.match(job_id or ""):
        raise ValueError("That job id looks wrong")
    return job_id


def run_dir(job_id: str) -> str:
    return f'"$HOME"/{RUN_ROOT}/{check_id(job_id)}'


def agent_line(agent: Agent, command: str, c: Choice, plain: bool = False) -> str:
    """The agent once on "$D/prompt.md", printing its answer. No tools: everything it needs is in the prompt.
    plain: only the flags every version knows (a cluster with an older agent)."""
    base = command.strip() or agent.id
    opts = [a for key in ("model", "effort") if (o := _option(agent, key)) for a in o.args(getattr(c, key))]
    prompt = '"$(cat "$D/prompt.md")"'
    if agent is CLAUDE:
        if plain:
            return " ".join([base, "-p", *_option(agent, "model").args(c.model), '< "$D/prompt.md"'])
        return " ".join([base, "-p", "--tools", "''", "--no-session-persistence", *opts, '< "$D/prompt.md"'])
    if agent is CODEX:
        return " ".join([base, "--no-daemon", "exec", "--skip-git-repo-check", "-s", "read-only", *opts, prompt])
    if agent is CURSOR:
        return " ".join([base, "-p", "--trust", "--mode", "ask", *opts, prompt])
    if agent is AGY:  # -p takes the prompt as its value, so it goes last
        return " ".join([base, *opts, "-p", prompt])
    return " ".join([base, "-p", prompt])


def run_script(job_id: str, agent: Agent, command: str, c: Choice, timeout: int = TIMEOUT) -> str:
    """run.sh: the agent in its own empty folder (no project files, nothing to load), its pid kept for Cancel,
    the answer printed after MARK, then the folder removed."""
    warm = ""
    if agent is CLAUDE:  # read the ~300 MB program in one go, not in small pieces (catalog.claude_start)
        exe = shlex.quote(shlex.split(command)[0]) if command.strip() else "claude"
        warm = f'{{ cat "$(readlink -f "$(type -P {exe})")" >/dev/null 2>&1 || true; }}'
    go = (f"go() {{ timeout {int(timeout)} bash -c \"$1\" > \"$D/out\" 2> \"$D/err\" & echo $! > \"$D/pid\"; "
          "wait $!; }")
    lines = [f"D={run_dir(job_id)}", "export D", 'cd "$D" || exit 1', go, warm,
             '[ -e "$D/cancelled" ] && { cd / && rm -rf "$D"; exit 130; }',
             f"go {shlex.quote(agent_line(agent, command, c))}", "rc=$?"]
    plain = agent_line(agent, command, c, plain=True)
    if plain != agent_line(agent, command, c):
        lines += ['if [ $rc -ne 0 ] && grep -qiE "unknown option|unexpected argument|unrecognized" "$D/err"; then',
                  f"  go {shlex.quote(plain)}; rc=$?", "fi"]
    lines += [f"echo {MARK}", 'cat "$D/out"', '[ $rc -eq 0 ] || tail -n 20 "$D/err" >&2', 'cd / && rm -rf "$D"',
              "exit $rc"]
    return "\n".join(x for x in lines if x) + "\n"


def prepare_script(job_id: str, run_sh: str) -> str:
    """For the login node, the prompt on stdin: the job's folder with prompt.md and run.sh."""
    b64 = base64.b64encode(run_sh.encode()).decode()
    return (f"D={run_dir(job_id)}; mkdir -p \"$D\" && cat > \"$D/prompt.md\" && "
            f"printf %s {b64} | base64 -d > \"$D/run.sh\"")


def start_line(job_id: str) -> str:
    """On the node: run.sh from a login shell, so the agent's PATH (set in ~/.bashrc) is there."""
    return f"bash -ic {shlex.quote(f'bash {run_dir(job_id)}/run.sh')} </dev/null"


def cancel_line(job_id: str) -> str:
    """On the node: stop the agent (timeout passes the signal on); run.sh then cleans up."""
    d = run_dir(job_id)
    return f'touch {d}/cancelled 2>/dev/null; p=$(cat {d}/pid 2>/dev/null) && kill -TERM "$p" 2>/dev/null; true'


def answer(stdout: str) -> str:
    """What the agent printed: everything after the mark (a login shell may print before it)."""
    _, found, after = stdout.rpartition(MARK + "\n")
    return after if found else stdout
