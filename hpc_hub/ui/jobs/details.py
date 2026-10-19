"""Job details dialog: the fields people look at, grouped, and all of them behind an expander."""

import re

from gi.repository import Adw, GLib, Gtk, Pango

from ...jobs import JobInfo, job_details, parse_details
from ..widgets import bg
from .columns import su_text


class DetailsMixin:
    """JobsPage's Details button and row activation."""

    def _details(self, j: JobInfo | None) -> None:
        if not j or not self.session.ssh:
            return
        s = self.session
        page = Adw.PreferencesPage()
        page.add(Adw.PreferencesGroup(description="Loading…"))
        header = Adw.HeaderBar()
        toolbar = Adw.ToolbarView(content=page)
        toolbar.add_top_bar(header)
        if self._cancellable(j):
            cancel = Gtk.Button(label="Cancel job", css_classes=["destructive-action"])
            cancel.connect("clicked", lambda *_: (dialog.close(), self._confirm_cancel(j)))
            header.pack_start(cancel)
        dialog = Adw.Dialog(title=f"Job {j.job_id} · {j.name}", content_width=600, content_height=640,
                            child=toolbar)
        dialog.present(self.get_root())

        bg(lambda: job_details(s.ssh, j.job_id),
           lambda text, err: self._fill_details(dialog, toolbar, j, text or err))

    def _fill_details(self, dialog: Adw.Dialog, toolbar: Adw.ToolbarView, j: JobInfo, text: str) -> None:
        """The few fields people look at, grouped; everything else behind "All fields"."""
        d = parse_details(text)

        def get(*keys: str) -> str:
            for k in keys:
                v = d.get(k, "")
                if v and v not in ("(null)", "None", "N/A", "Unknown"):
                    return v
            return ""

        tres = get("AllocTRES", "ReqTRES")
        gpus = re.findall(r"gres/gpu(?::[^=,]+)?=(\d+)", tres)
        state, reason = get("JobState", "State"), get("Reason")

        def when(*keys: str) -> str:  # 2026-10-19T17:07:01 -> 2026-10-19 17:07
            return get(*keys).replace("T", " ")[:16]

        groups = [
            ("Status", [
                ("State", f"{state} ({reason})" if reason else state),
                ("Run time", " of ".join(x for x in (get("RunTime", "Elapsed"), get("TimeLimit", "Timelimit")) if x)),
                ("Started", when("StartTime", "Start")),
                ("Ends" if state in ("RUNNING", "PENDING") else "Ended", when("EndTime", "End")),
                ("Submitted", when("SubmitTime", "Submit")),
                ("Exit code", get("ExitCode") if state not in ("RUNNING", "PENDING") else ""),
            ]),
            ("Resources", [
                ("Node", get("NodeList")),
                ("CPUs", get("NumCPUs", "AllocCPUS")),
                ("Memory", (re.search(r"mem=([^,]+)", tres) or [None, get("ReqMem")])[1]),
                ("GPUs", str(sum(int(g) for g in gpus)) if gpus else ""),
                ("Partition · QoS · account", " · ".join(x for x in (get("Partition"), get("QOS"), get("Account")) if x)),
                ("SU", su_text(j) if j.state else ""),
            ]),
            ("Files", [
                ("Work folder", get("WorkDir")),
                ("Output", get("StdOut")),
                ("Errors", get("StdErr") if get("StdErr") != get("StdOut") else ""),
            ]),
        ]
        page = Adw.PreferencesPage()
        for title, rows in groups:
            group = Adw.PreferencesGroup(title=title)
            for label, value in rows:
                if not value:
                    continue
                if title != "Files":  # short values: label left, value right, one line each
                    row = Adw.ActionRow(title=label)
                    row.add_suffix(Gtk.Label(label=value, selectable=True, xalign=1))
                    group.add(row)
                    continue
                row = Adw.ActionRow(title=label, subtitle=GLib.markup_escape_text(value), subtitle_selectable=True,
                                    css_classes=["property"])
                copy = Gtk.Button(icon_name="edit-copy-symbolic", css_classes=["flat"], valign=Gtk.Align.CENTER,
                                  tooltip_text="Copy path")
                copy.connect("clicked", lambda b, v=value: (b.get_clipboard().set(v), self.toast("Path copied")))
                row.add_suffix(copy)
                group.add(row)
            page.add(group)
        raw = Gtk.Label(label=text, xalign=0, selectable=True, wrap=True, wrap_mode=Pango.WrapMode.WORD_CHAR,
                        css_classes=["monospace", "caption"], margin_top=6)
        more = Adw.PreferencesGroup()
        more.add(Gtk.Expander(label="All fields", child=raw))
        page.add(more)
        toolbar.set_content(page)
