"""Build a LaTeX project on the cluster: settings, the build, its log and issues."""

import posixpath

from gi.repository import Adw, GLib, Gtk

from ... import latex
from ...files import remote_fs
from ...core.config import LATEX_ENGINES
from ...latex import LatexIssue
from ..widgets import bg


class BuildMixin:
    """LatexPage's build settings popover, Build button and build log."""

    def _settings_popover(self) -> Gtk.Popover:
        box = Gtk.Box(orientation=Gtk.Orientation.VERTICAL, spacing=8, margin_top=8, margin_bottom=8,
                      margin_start=8, margin_end=8, width_request=320)
        self.setup_entry = Gtk.Entry(placeholder_text="Before build, e.g. module load TeXLive")
        self.engine = Gtk.DropDown.new_from_strings(["pdfLaTeX", "XeLaTeX", "LuaLaTeX"])
        self.on_node = Gtk.CheckButton(label="Build on my compute node (if I have one)")
        apply = Gtk.Button(label="Save settings")
        for w in (Gtk.Label(label="Build settings", xalign=0, css_classes=["heading"]), self.setup_entry,
                  self.engine, self.on_node, apply):
            box.append(w)
        pop = Gtk.Popover(child=box)
        pop.connect("show", lambda *_: self._load_settings())
        apply.connect("clicked", lambda *_: (self._store_settings(), pop.popdown()))
        return pop

    def _load_settings(self) -> None:
        if self.session:
            s = self.session.cfg.latex
            self.setup_entry.set_text(s.setup)
            self.engine.set_selected(LATEX_ENGINES.index(s.engine) if s.engine in LATEX_ENGINES else 0)
            self.on_node.set_active(s.on_node)

    def _store_settings(self) -> None:
        if self.session:
            s = self.session.cfg.latex
            s.setup, s.engine = self.setup_entry.get_text().strip(), LATEX_ENGINES[self.engine.get_selected()]
            s.on_node = self.on_node.get_active()
            self.save_config()
            self.toast("Build settings saved")

    # -- build -----------------------------------------------------------------------------
    def build(self) -> None:
        if self.building or not self.session:
            return
        s = self.session
        a = s.allocation
        self.building = True
        self.spinner.set_visible(True)
        self.build_btn.set_sensitive(False)

        def work():
            res = latex.build(s.ssh, self.main, s.cfg.latex, a.job_id if a else None)
            log = (res.stdout or "") + (res.stderr or "")
            pdf = None
            if res.returncode == 0:
                pdf = remote_fs.read_bytes(s.ssh, latex.pdf_path(self.main))
            return res.returncode, log, pdf

        def done(result, err):
            self.building = False
            self.spinner.set_visible(False)
            self.build_btn.set_sensitive(True)
            if err:
                self.toast(f"Build failed: {err}")
                return
            code, log, pdf = result
            self.log_view.get_buffer().set_text(log[-200000:])
            issues = latex.parse_issues(log)
            self._show_issues(issues)
            if pdf:
                self.pdf.load_bytes(pdf)
                self.toast("Built" + (f" with {len(issues)} warnings" if issues else ""))
                self._load_sync()
            else:
                self.log_expander.set_expanded(True)
                self.toast(f"Build failed ({len(issues)} errors)" if issues else "Build failed, see log")

        bg(work, done)

    def _load_pdf(self) -> None:
        s, main = self.session, self.main

        def done(data, err):
            if data:
                self.pdf.load_bytes(data, keep_position=False)
            else:
                self.pdf.show_message("No PDF yet", "Press Build.")
        bg(lambda: remote_fs.read_bytes(s.ssh, latex.pdf_path(main)), done)

    def _show_issues(self, issues: list[LatexIssue]) -> None:
        while row := self.issues.get_row_at_index(0):
            self.issues.remove(row)
        for i in issues[:50]:
            row = Adw.ActionRow(title=GLib.markup_escape_text(i.message), subtitle=f"{i.file}:{i.line}",
                                activatable=True)
            row.issue = i
            row.add_prefix(Gtk.Image.new_from_icon_name("dialog-error-symbolic"))
            self.issues.append(row)
        self.issues.set_visible(bool(issues))

    def _goto(self, issue: LatexIssue) -> None:
        if posixpath.basename(self.current) == issue.file:
            self._jump(issue.line)
            return
        match = next((f for f in self.files if posixpath.basename(f) == issue.file), None)
        if match:
            self.save(then=lambda: self._load_file(posixpath.join(self.folder, match), issue.line))
