"""The desktop app's words follow the owner's rules (docs/design/feedback-rules.md): no bare Cancel next to a
destructive button, no Skip, Release node (not End node), Sign in (not Log in), queue (not partition or QOS),
no hostname under a cluster's name. Demo data and comments are not checked."""

import re
from pathlib import Path

SRC = Path(__file__).resolve().parents[1] / "app" / "src"
FILES = [p for p in SRC.rglob("*.ts*") if "demo" not in p.parts and p.name != "loginStrings.ts"]

STRING = re.compile(r"'((?:[^'\\\n]|\\.)*)'|\"((?:[^\"\\\n]|\\.)*)\"|`((?:[^`\\]|\\.)*)`")
JSX_TEXT = re.compile(r">([^<>{}\n]*[A-Za-z][^<>{}\n]*)<")


def _code(text: str) -> str:
    """The file without its comments."""
    text = re.sub(r"/\*.*?\*/", "", text, flags=re.S)
    return "\n".join(re.sub(r"(^|\s)//.*$", "", line) for line in text.splitlines())


def _words(path: Path) -> list[str]:
    """What the user can read: string literals with a space in them, and text between JSX tags."""
    code = _code(path.read_text(encoding="utf-8"))
    found = [next(g for g in m.groups() if g is not None) for m in STRING.finditer(code)]
    found = [s for s in found if " " in s.strip() and not s.lstrip().startswith(("-", "/", "."))]
    return found + [m.group(1).strip() for m in JSX_TEXT.finditer(code)]


def _classes(w: str) -> bool:
    """A Tailwind class list ("flex items-center gap-2"), not words: all lower case, with a hyphenated class."""
    return not re.search(r"[A-Z]", w) and bool(re.search(r"\b[a-z]+-[\w\[]", w))


def _hits(rule: str, flags=0) -> dict[str, list[str]]:
    out: dict[str, list[str]] = {}
    for p in FILES:
        bad = [w for w in _words(p) if re.search(rule, w, flags) and "className" not in w and not _classes(w)]
        if bad:
            out[str(p.relative_to(SRC))] = bad
    return out


def test_no_bare_cancel_next_to_a_destructive_button():
    bad = []
    for p in FILES:
        lines = p.read_text(encoding="utf-8").splitlines()
        for i, line in enumerate(lines):
            if ">Cancel</Button>" in line and any(re.search(r'kind="(destructive|danger|danger-solid)"', x)
                                                    for x in lines[max(0, i - 3):i + 4]):
                bad.append(f"{p.relative_to(SRC)}:{i + 1}")
    assert not bad, "use AlertDialog with its own keep label (Keep it, Keep running)"


def test_no_skip():
    assert not _hits(r"\bSkip\b")


def test_release_node_not_end_node():
    assert not _hits(r"\bEnd (the )?node\b|\bnode (is )?ended\b", re.I)


def test_sign_in_not_log_in():
    assert not _hits(r"\b[Ll]og(ged)? in\b|\blogin was\b")


def test_queue_not_partition_or_qos():
    found = _hits(r"\b(partition|partitions|QOS|QoS|salloc|sbatch)\b")
    found.pop("components/Term.tsx", None)  # the glossary tooltips name Slurm's word on purpose
    assert not found


def test_no_hostname_under_a_cluster_name():
    card = (SRC / "components" / "ClusterCard.tsx").read_text(encoding="utf-8")
    assert "c.host" not in _code(card)


def test_no_if_else_copy():
    """State what is true now, not the program's branches ("None picked means every day", "0 asks for a code")."""
    assert not _hits(r"\bNone picked means\b|^0 asks\b| 0 asks\b|\bempty = |\bOff: ")


def test_no_bare_gpu_count():
    """A GPU always has its type: "2 × A100", "A100, 10 GB slice", never "2 GPUs" (rule 13)."""
    assert not _hits(r"\$\{[^}]*\} GPU(s|\$\{)|\bGPUs\b'\]")


def test_jobs_say_waiting_and_hours():
    """The desktop uses the phone's words: Waiting (not Pending), Hours (not a bare SU tab)."""
    fmt = (SRC / "components" / "jobs" / "format.ts").read_text(encoding="utf-8")
    assert "PENDING: 'Waiting'" in fmt
    assert "['su', 'SU'," not in (SRC / "pages" / "Usage.tsx").read_text(encoding="utf-8")


def test_no_app_insides():
    """Say what the user gets, not how the app works (rule 2): no helper installs, no rm or .trash talk."""
    assert not _hits(r"small helper|instead of rm|rm is blocked|\.trash for|own switch below")


def test_same_lock_words_as_the_phone():
    """One wording on both platforms (rule 21)."""
    assert not _hits(r"Minutes a code keeps|Wrong codes before|Anything not ticked")
