"""What the agent reads."""

from .model import Ask, where

MAX_ERROR = 20_000  # characters of error text put in the prompt


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
