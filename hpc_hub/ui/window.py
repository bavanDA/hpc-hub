from gi.repository import Adw, Gtk

from .. import APP_NAME
from .cluster_card import ClusterCard
from .files import FilesPage
from .jobs import JobsPage
from .latex import LatexPage
from .terminals import TerminalsPage


class MainWindow(Adw.ApplicationWindow):
    def __init__(self, app, sessions, on_connect, on_disconnect, on_settings, on_tool, save_config=lambda: None,
                 make_globus=None, make_projects=None, store=None):
        super().__init__(application=app, title=APP_NAME, default_width=1000, default_height=760)
        self.cards: dict[str, ClusterCard] = {}

        menu = Gtk.PopoverMenu.new_from_model(self._menu())
        header = Adw.HeaderBar()
        header.pack_end(Gtk.MenuButton(icon_name="open-menu-symbolic", popover=menu, tooltip_text="Menu"))

        column = Gtk.Box(orientation=Gtk.Orientation.VERTICAL, spacing=18,
                         margin_top=24, margin_bottom=24, margin_start=16, margin_end=16)
        for s in sessions:
            card = ClusterCard(s, on_connect, on_disconnect, on_settings, on_tool, save_config)
            self.cards[s.cfg.id] = card
            column.append(card)

        clamp = Adw.Clamp(maximum_size=760, child=column)
        self.stack = Adw.ViewStack()
        if make_projects:
            self.projects = make_projects(self.toast)
            self.stack.add_titled_with_icon(self.projects, "projects", "Projects", "view-grid-symbolic")
        self.stack.add_titled_with_icon(
            Gtk.ScrolledWindow(child=clamp, vexpand=True), "clusters", "Clusters", "network-server-symbolic")
        self.jobs = JobsPage(sessions, self.toast)
        self.stack.add_titled_with_icon(self.jobs, "jobs", "Jobs", "view-list-symbolic")
        self.files = FilesPage(sessions, self.toast, self.open_latex)
        self.stack.add_titled_with_icon(self.files, "files", "Files", "folder-symbolic")
        if make_globus:
            self.globus = make_globus(self.toast)
            self.stack.add_titled_with_icon(self.globus, "globus", "Globus", "network-transmit-receive-symbolic")
        self.latex = LatexPage(sessions, self.toast, save_config, store,
                               lambda: self.projects.edit(None, create=True) if make_projects else None)
        self.stack.add_titled_with_icon(self.latex, "latex", "LaTeX", "x-office-document-symbolic")
        self.terminals = TerminalsPage(sessions, self.toast)
        self.stack.add_titled_with_icon(self.terminals, "terminals", "Terminals", "utilities-terminal-symbolic")
        header.set_title_widget(Adw.ViewSwitcher(stack=self.stack, policy=Adw.ViewSwitcherPolicy.WIDE))
        self.toasts = Adw.ToastOverlay(child=self.stack)

        view = Adw.ToolbarView(content=self.toasts)
        view.add_top_bar(header)
        self.set_content(view)

    def _menu(self):
        from gi.repository import Gio
        menu = Gio.Menu()
        menu.append("About HPC Hub", "app.about")
        menu.append("Disconnect all and quit…", "app.disconnect-quit")
        menu.append("Quit (keep everything running)", "app.quit")
        return menu

    def open_latex(self, session, path: str) -> None:
        self.latex.open(session, path)
        self.stack.set_visible_child_name("latex")

    def toast(self, text: str) -> None:
        self.toasts.add_toast(Adw.Toast(title=text, timeout=4))
