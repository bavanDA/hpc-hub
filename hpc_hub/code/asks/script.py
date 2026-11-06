"""run.sh and the shell lines that start and cancel an ask. It runs in its own tmux session, so it outlives
the app; files the agent edits anyway are put back."""

import base64
import json
import shlex

from .model import ROOT, Ask, check_id
from .prompt import prompt


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


def cancel_command(ask_id: str) -> str:
    """Run where the ask runs (its node): mark it cancelled and stop the agent. run.sh then puts back any file
    the agent touched and ends as cancelled."""
    out = f'"$HOME"/{ROOT}/{check_id(ask_id)}'
    return (f"[ -d {out} ] || exit 0; touch {out}/cancelled; p=$(cat {out}/pid 2>/dev/null); "
            f"if [ -n \"$p\" ]; then kill -TERM -- -\"$p\" 2>/dev/null || kill -TERM \"$p\" 2>/dev/null; "
            f"else printf cancelled > {out}/state; fi; true")
