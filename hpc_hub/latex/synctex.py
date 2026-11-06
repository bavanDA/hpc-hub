"""SyncTeX positions are TeX scaled points from the page's top left; / 65781.76 gives PDF points."""

import gzip
import posixpath
import re
from dataclasses import dataclass

SP_PER_BP = 65781.76
RECORD_RE = re.compile(r"^([hvxkg$\[(])(\d+),(\d+)(?:,-?\d+)?:(-?\d+),(-?\d+)")


@dataclass
class Spot:
    page: int  # 1-based
    tag: int
    line: int
    x: float  # PDF points from the left
    y: float  # PDF points from the top (baseline)


class SyncTex:
    def __init__(self, text: str):
        self.inputs: dict[int, str] = {}
        self.spots: list[Spot] = []
        unit, page = 1.0, 0
        for line in text.splitlines():
            if line.startswith("Input:"):
                tag, _, path = line[6:].partition(":")
                if tag.isdigit():
                    self.inputs[int(tag)] = posixpath.normpath(path)
            elif line.startswith("Unit:"):
                unit = float(line[5:] or 1)
            elif line.startswith("{") and line[1:].isdigit():
                page = int(line[1:])
            elif page:
                m = RECORD_RE.match(line)
                if m and int(m.group(3)) > 0:
                    scale = unit / SP_PER_BP
                    self.spots.append(Spot(page, int(m.group(2)), int(m.group(3)),
                                           int(m.group(4)) * scale, int(m.group(5)) * scale))

    @classmethod
    def from_gz(cls, data: bytes) -> "SyncTex":
        return cls(gzip.decompress(data).decode("utf-8", "replace"))

    def edit(self, page: int, x: float, y: float) -> tuple[str, int] | None:
        """PDF click -> (source file, line). Lines count more than columns."""
        best = min((s for s in self.spots if s.page == page),
                   key=lambda s: abs(s.y - y) * 4 + abs(s.x - x), default=None)
        return (self.inputs.get(best.tag, ""), best.line) if best else None

    def view(self, path: str, line: int, folder: str = "") -> Spot | None:
        """Source line -> first place on the PDF it shows up (or the nearest line that does)."""
        tags = {t for t, p in self.inputs.items() if _same(p, path, folder)}
        here = [s for s in self.spots if s.tag in tags]
        if not here:
            return None
        nearest = min(abs(s.line - line) for s in here)
        return min((s for s in here if abs(s.line - line) == nearest), key=lambda s: (s.page, s.y, s.x))


def _same(a: str, b: str, folder: str) -> bool:
    """Same file, also when one path goes through a symlink (/scratch vs /mmfs1/scratch)."""
    a, b = posixpath.normpath(a), posixpath.normpath(b)
    if a == b:
        return True
    rel = posixpath.relpath(b, folder) if folder and b.startswith(folder.rstrip("/") + "/") else ""
    return bool(rel) and (a.endswith("/" + rel) or a == rel)
