#!/usr/bin/env python3
"""Claude Code hook from HPC Hub: rm goes to trash instead, and some commands always ask first.
What is on is in guard.json next to this file (HPC Hub's Permissions page writes it)."""
import json
import os
import re
import sys

cmd = (json.load(sys.stdin).get("tool_input") or {}).get("command", "")
try:
    with open(os.path.join(os.path.dirname(os.path.abspath(__file__)), "guard.json")) as f:
        on = json.load(f)
except (OSError, ValueError):
    on = {"trash": True, "ask": ["scancel", "force_push", "discard"]}
START = (r"(?:^|[;&|(`{]|\$\(|\b(?:xargs|sudo|exec|env|nohup|command|nice)(?:\s+-\S+)*\s+|\btimeout\s+\S+\s+"
         r"|-exec(?:dir)?\s+)\s*(?:\w+=\S*\s+)*")
ASK = {
    "scancel": (START + r"scancel\b", "scancel stops jobs; the user approves each one."),
    "force_push": (r"\bgit\b[^;&|]*\bpush\b[^;&|]*(\s-f\b|--force\b|--force-with-lease|\s\+\S)",
                   "force push rewrites history on the remote; the user approves it."),
    "discard": (r"\bgit\b[^;&|]*\b(reset\b[^;&|]*--hard|clean\b[^;&|]*\s-\w*f)",
                "this throws away uncommitted work; the user approves it."),
}


def answer(decision, reason):
    print(json.dumps({"hookSpecificOutput": {"hookEventName": "PreToolUse",
                                             "permissionDecision": decision,
                                             "permissionDecisionReason": reason}}))
    sys.exit(0)


if on.get("trash") and (re.search(START + r"(?:/usr)?(?:/bin/)?rm\s", cmd + " ")
                        or re.search(r"\bfind\b.*\s-delete\b", cmd)):
    answer("deny", "rm is turned off here. Use `trash <paths>` instead (same flags as rm, can be undone for 7 days).")
for key in on.get("ask", []):
    if key in ASK and re.search(ASK[key][0], cmd):
        answer("ask", ASK[key][1])
sys.exit(0)
