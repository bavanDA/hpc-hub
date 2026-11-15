"""Files copied on this computer (Copy in the file manager, Finder or Explorer), for Paste in the Files page: their
paths here. Linux: wl-paste (Wayland) or xclip (X11); macOS: the pasteboard through osascript; Windows: PowerShell."""

import os
import shutil
import subprocess
import sys
from urllib.parse import unquote, urlsplit

URI_TYPES = ("text/uri-list", "x-special/gnome-copied-files")  # what Files, Dolphin, Thunar... put there

# Finder's copied files are file URLs on the pasteboard
MAC_JS = """ObjC.import('AppKit');
var pb = $.NSPasteboard.generalPasteboard;
var opts = $.NSDictionary.dictionaryWithObjectForKey(true, $.NSPasteboardURLReadingFileURLsOnlyKey);
var got = pb.readObjectsForClassesOptions($.NSArray.arrayWithObject($.NSURL), opts);
var out = [];
if (got) { for (var i = 0; i < got.count; i++) { out.push(got.objectAtIndex(i).path.js); } }
out.join('\\n');"""
WINDOWS_PS = ("[Console]::OutputEncoding = [Text.Encoding]::UTF8; "
              "Get-Clipboard -Format FileDropList | ForEach-Object { $_.FullName }")


class Unreadable(Exception):
    """This computer has no way for the app to read copied files (Linux without wl-paste or xclip)."""


def from_uris(text: str) -> list[str]:
    """file:// lines (a uri-list, or GNOME's "copy" then the URIs) as paths; anything else is left out."""
    out = []
    for line in text.splitlines():
        line = line.strip()
        if not line.lower().startswith("file://"):
            continue
        u = urlsplit(line)
        if u.netloc not in ("", "localhost"):
            continue
        out.append(unquote(u.path))
    return out


def _run(argv: list[str], timeout: float = 5) -> str:
    flags = getattr(subprocess, "CREATE_NO_WINDOW", 0)
    try:
        res = subprocess.run(argv, capture_output=True, text=True, encoding="utf-8", errors="replace",
                             timeout=timeout, stdin=subprocess.DEVNULL, creationflags=flags)
    except (OSError, subprocess.TimeoutExpired):
        return ""
    return res.stdout if res.returncode == 0 else ""


def _linux() -> list[str]:
    if os.environ.get("WAYLAND_DISPLAY") and shutil.which("wl-paste"):
        types = _run(["wl-paste", "--list-types"]).split()
        kind = next((t for t in URI_TYPES if t in types), "")
        return from_uris(_run(["wl-paste", "--no-newline", "--type", kind])) if kind else []
    if os.environ.get("DISPLAY") and shutil.which("xclip"):
        types = _run(["xclip", "-selection", "clipboard", "-t", "TARGETS", "-o"]).split()
        kind = next((t for t in URI_TYPES if t in types), "")
        return from_uris(_run(["xclip", "-selection", "clipboard", "-t", kind, "-o"])) if kind else []
    raise Unreadable("To paste files copied on this computer, install wl-clipboard (or xclip on X11)")


MAX_TEXT = 4 * 1024 * 1024
TEXT_TYPES = ("text/plain;charset=utf-8", "UTF8_STRING", "text/plain", "STRING", "TEXT")


def copied_text(platform: str = sys.platform) -> str:
    """The text on this computer's clipboard, read with the system's own tools: for when the window can't (some
    Linux desktops refuse it). "" when it holds no text; Unreadable when there is no tool to ask."""
    if platform == "darwin":
        return _run(["pbpaste"])[:MAX_TEXT]
    if platform == "win32":
        return _run(["powershell", "-NoProfile", "-NonInteractive", "-Command",
                     "[Console]::OutputEncoding = [Text.Encoding]::UTF8; Get-Clipboard -Raw"], timeout=10)[:MAX_TEXT]
    if os.environ.get("WAYLAND_DISPLAY") and shutil.which("wl-paste"):
        types = _run(["wl-paste", "--list-types"]).split("\n")
        kind = next((t for t in TEXT_TYPES if t in types), "")
        return _run(["wl-paste", "--no-newline", "--type", kind])[:MAX_TEXT] if kind else ""
    if os.environ.get("DISPLAY") and shutil.which("xclip"):
        return _run(["xclip", "-selection", "clipboard", "-o"])[:MAX_TEXT]
    if os.environ.get("DISPLAY") and shutil.which("xsel"):
        return _run(["xsel", "--clipboard", "--output"])[:MAX_TEXT]
    raise Unreadable("No way to read the clipboard here: install wl-clipboard (or xclip)")


def copied_files(platform: str = sys.platform) -> list[str]:
    """Paths of the files and folders copied on this computer that are there; [] when what is copied isn't files."""
    if platform == "darwin":
        found = _run(["osascript", "-l", "JavaScript", "-e", MAC_JS]).splitlines()
    elif platform == "win32":
        found = _run(["powershell", "-NoProfile", "-NonInteractive", "-Command", WINDOWS_PS], timeout=10).splitlines()
    else:
        found = _linux()
    return [p for p in dict.fromkeys(f.strip() for f in found) if p and os.path.exists(p)]
