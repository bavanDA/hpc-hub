"""remote-lock's log lines in words."""

import re

_EVENTS = ((r"ok \S+ \(open (\d+) min\)", "Code accepted, open for {} min"), (r"ok \S+", "Code accepted"),
           (r"wrong code (\d+) of (\d+) in \S+", "Wrong code, {} of {}"),
           (r"locked: stopping Claude", "Locked, Claude stopped"),
           (r"locked by hand", "Locked"), (r"set up", "Lock turned on"), (r"set .*", "Lock settings changed"),
           (r"reset", "Unlocked"))
_MONTHS = "Jan Feb Mar Apr May Jun Jul Aug Sep Oct Nov Dec".split()


def activity(line: str) -> str:
    """"2026-10-24 09:12:03 ok main (open 10 min)" -> "Oct 24, 09:12 · Code accepted, open for 10 min"."""
    m = re.match(r"(\d{4})-(\d\d)-(\d\d) (\d\d:\d\d)(?::\d\d)? (.*)", line)
    if not m:
        return line
    _, month, day, clock, what = m.groups()
    return f"{_MONTHS[int(month) - 1]} {int(day)}, {clock} · {_event(what)}"


def _event(what: str) -> str:
    for pattern, words in _EVENTS:
        e = re.fullmatch(pattern, what)
        if e:
            return words.format(*e.groups())
    return what


def recent(log: list[str], n: int = 10) -> list[str]:
    """The last n lines in words, newest first."""
    return [activity(x) for x in reversed(log[-n:])]
