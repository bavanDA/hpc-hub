"""The status line of a copy: sizes and where a Globus task is at."""

from ..globus.api import TaskInfo


def size_text(n: float) -> str:
    """1.2 MB: powers of 1000."""
    if n < 1000:
        return f"{int(n)} bytes"
    for unit in ("kB", "MB", "GB", "TB"):
        n /= 1000
        if n < 1000 or unit == "TB":
            break
    return f"{n:.1f} {unit}"


def task_line(i: TaskInfo) -> str:
    if i.status == "SUCCEEDED":
        return f"Done · {size_text(i.bytes)} · {i.files} files"
    if i.cancelled:
        return "Cancelled"
    problem = i.problem.replace("_", " ").lower()
    if i.status == "FAILED":
        return f"Failed: {problem}" if problem else "Failed"
    parts = [problem or ("Copying" if i.files else "Counting files"), size_text(i.bytes)]
    if i.files:
        parts.append(f"{i.files_done} of {i.files} files")
    if i.rate:
        parts.append(f"{size_text(i.rate)}/s")
    return " · ".join(parts)
