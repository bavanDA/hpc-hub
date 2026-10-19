"""A tmux session's menu: rename, color, stop."""

from gi.repository import Adw, Gtk

from ... import tmux
from ...session import ClusterSession
from ..widgets import ask_name, bg, color_dot


class SessionMenuMixin:
    """TerminalsPage: the ⋯ menu on a session row and in the header."""

    def _menu(self, s: ClusterSession, t: tmux.Session) -> Gtk.Popover:
        box = Gtk.Box(orientation=Gtk.Orientation.VERTICAL, spacing=2, margin_top=4, margin_bottom=4,
                      margin_start=4, margin_end=4)
        pop = Gtk.Popover(child=box)
        b = Gtk.Button(label="Rename…", css_classes=["flat"])
        b.get_child().set_xalign(0)
        b.connect("clicked", lambda *_: (pop.popdown(), self.rename(s, t)))
        box.append(b)
        if t.kind == "tmux":
            colors = Gtk.Box(spacing=4, margin_top=4, margin_bottom=4, margin_start=6)
            for c in tmux.COLORS:
                b = Gtk.Button(child=color_dot(c, 14), css_classes=["flat", "circular"], tooltip_text=c)
                b.connect("clicked", lambda *_, c=c: (pop.popdown(), self._do(s, tmux.set_color(t, c), t, color=c)))
                colors.append(b)
            box.append(colors)
        stop = Gtk.Button(label="Stop session…", css_classes=["flat", "error"])
        stop.get_child().set_xalign(0)
        stop.connect("clicked", lambda *_: (pop.popdown(), self.stop(s, t)))
        box.append(stop)
        return pop

    def _do(self, s: ClusterSession, line: str, t: tmux.Session, color: str = "", title: str = "") -> None:
        key = (s.cfg.id, t.name)

        def done(_r, err):
            if err:
                self.toast(f"Failed: {err}")
            v = self.current
            if v and v.key == key:
                v.color, v.title = color or v.color, title or v.title
                self._header(v)
            self.refresh()
        bg(lambda: tmux.run(s.ssh, line), done)

    def rename(self, s: ClusterSession, t: tmux.Session) -> None:
        ask_name(self.get_root(), "Rename session", "Rename",
                 lambda name: self._do(s, tmux.set_label(t, name), t, title=name),
                 text=t.title, body=t.name, allow_slash=True)

    def stop(self, s: ClusterSession, t: tmux.Session) -> None:
        d = Adw.AlertDialog(heading=f"Stop {t.title}?", body="Everything running in it ends (Claude, a build…).")
        d.add_response("cancel", "Cancel")
        d.add_response("stop", "Stop")
        d.set_response_appearance("stop", Adw.ResponseAppearance.DESTRUCTIVE)

        def on_response(_d, r):
            if r != "stop":
                return
            if self.current and self.current.key == (s.cfg.id, t.name):
                self._show(None)
            self._do(s, tmux.kill(t), t)
        d.connect("response", on_response)
        d.present(self.get_root())
