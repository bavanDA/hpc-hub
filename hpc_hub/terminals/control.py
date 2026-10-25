"""tmux control mode (tmux -C): the pane's own output, so the terminal keeps a real scrollback.

Attached the usual way, tmux paints a fixed screen and the terminal has no history: you can't scroll it,
and a selection can't run past the edge. In control mode tmux sends what the program in the pane printed,
the terminal shows it as if it ran there, and keys go back as send-keys commands. Works with tmux 2.7.
"""

import math
import re
import unicodedata
from dataclasses import dataclass, field

OCTAL = re.compile(rb"\\([0-7]{3})")
ANSI = re.compile(r"\x1b\[[0-9;:?]*[ -/]*[@-~]|\x1b[()][0-9A-Za-z]|\x1b[=>78]")
HISTORY = 3000  # lines of history shown when a session opens
NO_TMUX = "hpchub-no-tmux"  # the cluster has no tmux: the bridge falls back to plain ssh -t

# what the pane is like right now; '|' keeps the places when an old tmux leaves a name empty
STATE_FIELDS = ("pane_id", "cursor_x", "cursor_y", "alternate_on", "pane_height", "history_size", "cursor_flag",
                "keypad_cursor_flag", "keypad_flag", "bracket_paste_flag", "mouse_standard_flag",
                "mouse_button_flag", "mouse_any_flag", "mouse_sgr_flag")
STATE_TAG = "hpchub-state"
CONTROL_KEYS = {0x1b: "Escape", 0x0d: "Enter", 0x09: "Tab", 0x7f: "BSpace", 0x00: "C-Space",
                0x1c: "C-\\", 0x1d: "C-]", 0x1e: "C-^", 0x1f: "C-_"}
RUN = 200  # characters per send-keys -l


def unescape(data: bytes) -> bytes:
    """%output data: tmux writes bytes below space, and the backslash, as \\ooo."""
    return OCTAL.sub(lambda m: bytes([int(m.group(1), 8)]), data)


def size_command(cols: int, rows: int) -> str:
    return f"refresh-client -C {max(cols, 10)},{max(rows, 2)}"  # 'w,h': tmux 2.7 and 3.x both take it


def restore_commands(cols: int, rows: int) -> list[str]:
    """Sent once after attaching: our size, how the pane is, its history, its screen."""
    fmt = "|".join([STATE_TAG] + [f"#{{{f}}}" for f in STATE_FIELDS])
    return [size_command(cols, rows), f"display -p '{fmt}'",
            f"capture-pane -p -e -S -{HISTORY} -E -1", "capture-pane -p -e"]


def _quote(text: str) -> str:
    return "'" + text + "'"  # no ' inside: keys() sends that one on its own


def keys(data: bytes) -> list[str]:
    """What you typed (bytes from the terminal) as tmux commands; control keys by name, the rest literal."""
    out: list[str] = []
    run = ""

    def flush():
        nonlocal run
        for i in range(0, len(run), RUN):
            out.append(f"send-keys -l -- {_quote(run[i:i + RUN])}")
        run = ""
    for ch in data.decode("utf-8", "replace"):
        b = ord(ch)
        if ch == "'":
            flush()
            out.append("send-keys -l -- \"'\"")
        elif b < 0x20 or b == 0x7f:
            flush()
            out.append("send-keys " + _quote(CONTROL_KEYS.get(b) or f"C-{chr(0x60 + b)}"))
        else:
            run += ch
    flush()
    return out


def command_lines(commands: list[str], limit: int = 2000) -> list[str]:
    """Join commands with ' ; ' into lines tmux runs in one go (so an Escape and what follows it arrive
    together), each under limit characters."""
    lines, cur = [], ""
    for c in commands:
        if cur and len(cur) + 3 + len(c) > limit:
            lines.append(cur)
            cur = ""
        cur = f"{cur} ; {c}" if cur else c
    if cur:
        lines.append(cur)
    return lines


def _width(text: str) -> int:
    plain = ANSI.sub("", text)
    return sum(2 if unicodedata.east_asian_width(c) in "WF" else 0 if unicodedata.combining(c) else 1
               for c in plain)


def _rows(line: str, cols: int) -> int:
    return max(1, math.ceil(_width(line) / max(cols, 1)))


@dataclass
class PaneState:
    cursor_x: int = 0
    cursor_y: int = 0
    alternate: bool = False
    height: int = 0
    history: int = 0
    flags: dict[str, bool] = field(default_factory=dict)

    @classmethod
    def parse(cls, line: str) -> "PaneState":
        parts = line.split("|")[1:]
        got = dict(zip(STATE_FIELDS, parts + [""] * (len(STATE_FIELDS) - len(parts))))

        def num(k):
            return int(got[k]) if got[k].isdigit() else 0
        return cls(num("cursor_x"), num("cursor_y"), got["alternate_on"] == "1", num("pane_height"),
                   num("history_size"), {k: got[k] == "1" for k in STATE_FIELDS[6:]})


MODES = (("keypad_cursor_flag", "\x1b[?1h"), ("keypad_flag", "\x1b="), ("bracket_paste_flag", "\x1b[?2004h"),
         ("mouse_standard_flag", "\x1b[?1000h"), ("mouse_button_flag", "\x1b[?1002h"),
         ("mouse_any_flag", "\x1b[?1003h"), ("mouse_sgr_flag", "\x1b[?1006h"))


def restore_screen(state: PaneState, history: list[str], visible: list[str], cols: int, rows: int) -> bytes:
    """Paint the history (into the terminal's scrollback) and the screen, put the cursor back and turn on
    the modes the program asked for (application keys, bracketed paste, mouse)."""
    if state.alternate:  # a full-screen program (vim, htop): its screen, no history
        lines, out = visible, "\x1b[?1049h\x1b[H\x1b[2J"
    else:
        lines, out = (history if state.history else []) + visible, ""
    out += "\x1b[0m\r\n".join(lines) + "\x1b[0m"
    used = sum(_rows(line, cols) for line in lines)
    top = max(0, min(used, rows) - sum(_rows(line, cols) for line in visible))  # screen row of the pane's top
    out += f"\x1b[{min(top + state.cursor_y, rows - 1) + 1};{state.cursor_x + 1}H"
    out += "".join(seq for name, seq in MODES if state.flags.get(name))
    if state.flags and not state.flags.get("cursor_flag", True):
        out += "\x1b[?25l"
    return out.encode()


class Reader:
    """Follows tmux's control output line by line.

    Until the screen is restored, %output is dropped: the capture already has it. Blocks (%begin..%end) are
    the answers to our commands, in order; ours are the state line and the two captures after it."""

    def __init__(self, cols: int, rows: int):
        self.cols, self.rows = cols, rows
        self.restored = False
        self.exited = False
        self._block: list[str] | None = None
        self._end: list[str] = []
        self._answers: list[list[str]] = []
        self._state: PaneState | None = None

    @property
    def in_block(self) -> bool:
        return self._block is not None

    def line(self, raw: bytes) -> bytes:
        """One line from tmux (without its newline); returns what to show in the terminal."""
        if self._block is not None:
            text = raw.decode("utf-8", "replace")
            if text.startswith(("%end ", "%error ")) and text.split(" ")[1:3] == self._end:
                return self._answer(self._block)
            self._block.append(text)
            return b""
        if raw.startswith(b"%output "):
            if not self.restored:
                return b""
            parts = raw.split(b" ", 2)
            return unescape(parts[2]) if len(parts) == 3 else b""
        if raw.startswith(b"%begin "):
            self._end = raw.decode("utf-8", "replace").split(" ")[1:3]  # time and number: its %end has them
            self._block = []
            return b""
        if raw.startswith(b"%exit"):
            self.exited = True
        return b""

    def _answer(self, body: list[str]) -> bytes:
        self._block = None
        if self.restored:
            return b""
        if self._state is None:
            if body and body[0].startswith(STATE_TAG + "|"):
                self._state = PaneState.parse(body[0])
            return b""
        self._answers.append(body)
        if len(self._answers) < 2:
            return b""
        self.restored = True
        history, visible = self._answers
        return restore_screen(self._state, history, visible, self.cols, self.rows)

    def give_up_restoring(self) -> None:
        """tmux never answered (very old or odd): show output from now on anyway."""
        self.restored = True
