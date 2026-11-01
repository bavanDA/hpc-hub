"""Status pills: a dot and a word, colored by what the state means. The same five kinds as the desktop app's
StatusPill (app/src/components/ui.tsx statusKind): success (connected, running), info (in progress), warning
(waiting: pending, Duo), error (failed) and neutral (off or over). Styles are in ui/style.py."""

import re

from gi.repository import Gtk

KINDS = ("success", "info", "warning", "error", "neutral")
# Adwaita's own text color classes, for a bare dot or word without the pill (the cluster card's status)
TEXT_CLASS = {"success": "success", "info": "accent", "warning": "warning", "error": "error", "neutral": "dim-label"}


def kind_for(state: str) -> str:
    s = state.lower()
    if re.match(r"(connected|running|done|ready|succeeded|active)\b", s):
        return "success"
    if re.search(r"duo|pending|waiting|queued|held|suspended|requeued", s):
        return "warning"
    if re.search(r"error|fail|timeout|timed out|out_of_memory|node_fail|boot_fail|deadline|preempted|lost", s):
        return "error"
    if re.search(r"connecting|signing|vpn|requesting|transferring|configuring|completing|starting|copying|sending|"
                 r"resizing", s):
        return "info"
    return "neutral"


class StatusPill(Gtk.Box):
    def __init__(self, text: str = "", kind: str | None = None):
        super().__init__(spacing=6, valign=Gtk.Align.CENTER, halign=Gtk.Align.START, css_classes=["status-pill"])
        self.dot = Gtk.Box(valign=Gtk.Align.CENTER, css_classes=["status-dot"])
        self.label = Gtk.Label()
        self.append(self.dot)
        self.append(self.label)
        self.set(text, kind)

    def set(self, text: str, kind: str | None = None) -> None:
        """kind None: picked from the text."""
        self.label.set_label(text)
        self.set_tooltip_text(text)
        kind = kind or kind_for(text)
        for k in KINDS:
            if k == kind:
                self.add_css_class(k)
            else:
                self.remove_css_class(k)
