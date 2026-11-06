from .text import Word, match_key

Token = tuple[str, float, float]  # text, start, end (seconds)
RESYNC = 6
MIN_SPAN = 0.02


def _prefix(part: str, whole: str) -> bool:
    return bool(part) and whole.startswith(part) and part != whole


def _split(start: float, end: float, weights: list[int]) -> list[tuple[float, float]]:
    total, span, cursor, out = sum(max(w, 1) for w in weights), max(end - start, 0.0), start, []
    for i, w in enumerate(weights):
        stop = end if i == len(weights) - 1 else cursor + span * max(w, 1) / total
        out.append((cursor, stop))
        cursor = stop
    return out


def _merge(keys: list[str], at: int, target: str) -> int:
    """How many keys from `at` join up to exactly target (0 if they don't)."""
    acc = ""
    for n in range(at, len(keys)):
        acc += keys[n]
        if acc == target:
            return n - at + 1
        if not _prefix(acc, target):
            return 0
    return 0


def align(words: tuple[Word, ...], tokens: list[Token]) -> dict[int, tuple[float, float]]:
    spoken = [w for w in words if match_key(w.text)]
    wk = [match_key(w.text) for w in spoken]
    tk = [match_key(t[0]) for t in tokens]
    times: dict[int, tuple[float, float]] = {}
    i = j = 0
    while i < len(wk) and j < len(tk):
        if wk[i] == tk[j]:
            times[spoken[i].id] = tokens[j][1:]
            i, j = i + 1, j + 1
        elif _prefix(wk[i], tk[j]) and (n := _merge(wk, i, tk[j])):  # one token, several words ("3.5percent")
            for k, span in enumerate(_split(tokens[j][1], tokens[j][2], [len(wk[i + m]) for m in range(n)])):
                times[spoken[i + k].id] = span
            i, j = i + n, j + 1
        elif _prefix(tk[j], wk[i]) and (n := _merge(tk, j, wk[i])):  # several tokens, one word
            times[spoken[i].id] = (tokens[j][1], tokens[j + n - 1][2])
            i, j = i + 1, j + n
        else:  # drift: skip ahead on whichever side finds a match sooner, else pair them up
            word_hit = next((k for k in range(i + 1, min(i + RESYNC, len(wk))) if wk[k] == tk[j]), None)
            token_hit = next((k for k in range(j + 1, min(j + RESYNC, len(tk))) if tk[k] == wk[i]), None)
            if word_hit is not None and (token_hit is None or word_hit - i <= token_hit - j):
                i = word_hit
            elif token_hit is not None:
                j = token_hit
            else:
                times[spoken[i].id] = tokens[j][1:]
                i, j = i + 1, j + 1
    return times


def fill_gaps(words: list[Word], times: dict[int, tuple[float, float]], total: float) -> list[tuple[int, float, float]]:
    """Every word gets a span: unspoken ones share the gap around them; times never go backwards."""
    out: list[tuple[int, float, float]] = []
    pending: list[Word] = []
    prev = 0.0

    def spread(group, start, end):
        step = max(end - start, 0.0) / len(group)
        return [(w.id, start + step * k, start + step * (k + 1)) for k, w in enumerate(group)]
    for w in words:
        span = times.get(w.id)
        if span is None:
            pending.append(w)
            continue
        if pending:
            out += spread(pending, prev, span[0])
            pending = []
        out.append((w.id, span[0], span[1]))
        prev = span[1]
    if pending:
        out += spread(pending, prev, max(total, prev))
    cursor, fixed = 0.0, []
    for wid, start, end in out:
        start = max(start, cursor)
        fixed.append((wid, round(start, 4), round(max(end, start + MIN_SPAN), 4)))
        cursor = start
    return fixed
