from gi.repository import Adw, Gio, GObject, Gtk

from .. import APP_NAME
from ..connect.ui.cluster_card import ClusterCard
from ..files.ui import FilesPage
from ..compute.ui.jobs import JobsPage
from ..latex.ui import LatexPage
from ..agents.ui.permissions_page import PermissionsPage
from ..terminals.ui import TerminalsPage
from ..agents.ui.schedules_page import SchedulesPage
from ..agents.ui.skills_page import SkillsPage
from ..compute.ui.usage_page import UsagePage


GROUPS = [  # sidebar sections: (heading, [(page, title, icon)])
    ("Work", [("projects", "Projects", "view-grid-symbolic"), ("latex", "LaTeX", "x-office-document-symbolic"),
              ("terminals", "Terminals", "utilities-terminal-symbolic"),
              ("schedules", "Scheduled agents", "alarm-symbolic"),
              ("skills", "Skills", "starred-symbolic"),
              ("permissions", "Permissions", "security-medium-symbolic")]),
    ("Cluster", [("clusters", "Clusters", "network-server-symbolic"), ("jobs", "Jobs", "view-list-symbolic"),
                 ("usage", "Usage", "power-profile-performance-symbolic")]),
    ("Data", [("files", "Files", "folder-symbolic"), ("globus", "Globus", "network-transmit-receive-symbolic")]),
]


class MainWindow(Adw.ApplicationWindow):
    def __init__(self, app, sessions, on_connect, on_disconnect, on_settings, on_tool, save_config=lambda: None,
                 make_globus=None, make_projects=None, store=None):
        super().__init__(application=app, title=APP_NAME, default_width=1200, default_height=800)
        self.cards: dict[str, ClusterCard] = {}

        column = Gtk.Box(orientation=Gtk.Orientation.VERTICAL, spacing=18,
                         margin_top=24, margin_bottom=24, margin_start=16, margin_end=16)
        for s in sessions:
            card = ClusterCard(s, on_connect, on_disconnect, on_settings, on_tool, save_config)
            self.cards[s.cfg.id] = card
            column.append(card)

        clamp = Adw.Clamp(maximum_size=760, child=column)
        self.stack = Adw.ViewStack()
        pages: dict[str, Gtk.Widget] = {}
        if make_projects:
            self.projects = pages["projects"] = make_projects(self.toast)
        pages["clusters"] = Gtk.ScrolledWindow(child=clamp, vexpand=True)
        self.jobs = pages["jobs"] = JobsPage(sessions, self.toast)
        self.usage = pages["usage"] = UsagePage(sessions, self.toast)
        self.files = pages["files"] = FilesPage(sessions, self.toast, self.open_latex)
        if make_globus:
            self.globus = pages["globus"] = make_globus(self.toast)
        self.latex = pages["latex"] = LatexPage(sessions, self.toast, save_config, store,
                                                lambda: self.projects.edit(None, create=True) if make_projects else None)
        self.terminals = pages["terminals"] = TerminalsPage(sessions, self.toast)
        self.schedules = pages["schedules"] = SchedulesPage(sessions, self.toast, save_config, store)
        self.skills = pages["skills"] = SkillsPage(sessions, self.toast)
        self.permissions = pages["permissions"] = PermissionsPage(sessions, self.toast)

        # left sidebar, grouped like GNOME Settings / Builder
        self.sidebar = Gtk.ListBox(css_classes=["navigation-sidebar"])
        self.rows: dict[str, Gtk.ListBoxRow] = {}
        for group, items in GROUPS:
            items = [i for i in items if i[0] in pages]
            if not items:
                continue
            head = Gtk.ListBoxRow(activatable=False, selectable=False)
            head.set_child(Gtk.Label(label=group, xalign=0, css_classes=["heading", "dim-label"],
                                     margin_start=6, margin_top=12 if self.rows else 4, margin_bottom=2))
            self.sidebar.append(head)
            for name, title, icon in items:
                self.stack.add_titled_with_icon(pages[name], name, title, icon)
                box = Gtk.Box(spacing=12, margin_start=4)
                box.append(Gtk.Image(icon_name=icon))
                box.append(Gtk.Label(label=title, xalign=0))
                row = Gtk.ListBoxRow(child=box)
                row.page = name
                self.sidebar.append(row)
                self.rows[name] = row
        self.sidebar.connect("row-selected", self._row_selected)
        self.stack.connect("notify::visible-child-name", lambda *_: self._page_changed())

        side_header = Adw.HeaderBar(show_end_title_buttons=False, title_widget=Adw.WindowTitle(title=APP_NAME))
        side = Adw.ToolbarView(content=Gtk.ScrolledWindow(child=self.sidebar, vexpand=True,
                                                          hscrollbar_policy=Gtk.PolicyType.NEVER))
        side.add_top_bar(side_header)

        menu = Gtk.PopoverMenu.new_from_model(self._menu())
        header = Adw.HeaderBar()
        self.split = Adw.OverlaySplitView(sidebar=side, min_sidebar_width=180, max_sidebar_width=220)
        toggle = Gtk.ToggleButton(icon_name="sidebar-show-symbolic", tooltip_text="Show or hide the sidebar",
                                  active=True)
        toggle.bind_property("active", self.split, "show-sidebar",
                             GObject.BindingFlags.BIDIRECTIONAL | GObject.BindingFlags.SYNC_CREATE)
        header.pack_start(toggle)
        header.pack_end(Gtk.MenuButton(icon_name="open-menu-symbolic", popover=menu, tooltip_text="Menu"))
        self.title = Adw.WindowTitle(title=APP_NAME)
        header.set_title_widget(self.title)
        self.toasts = Adw.ToastOverlay(child=self.stack)
        view = Adw.ToolbarView(content=self.toasts)
        view.add_top_bar(header)
        self.split.set_content(view)
        self.set_content(self.split)

        narrow = Adw.Breakpoint.new(Adw.BreakpointCondition.parse("max-width: 760sp"))
        narrow.add_setter(self.split, "collapsed", True)
        self.add_breakpoint(narrow)
        self.set_size_request(360, 400)
        self._page_changed()

    def _row_selected(self, _box, row) -> None:
        if row is not None and self.stack.get_visible_child_name() != row.page:
            self.stack.set_visible_child_name(row.page)
        if row is not None and self.split.get_collapsed():
            self.split.set_show_sidebar(False)  # narrow window: the sidebar floats, close it after a pick

    def _page_changed(self) -> None:
        name = self.stack.get_visible_child_name()
        row = self.rows.get(name)
        if row and self.sidebar.get_selected_row() is not row:
            self.sidebar.select_row(row)
        page = self.stack.get_page(self.stack.get_visible_child()) if self.stack.get_visible_child() else None
        self.title.set_title(page.get_title() if page else APP_NAME)

    def _menu(self) -> Gio.Menu:
        menu = Gio.Menu()
        menu.append("Preferences…", "app.preferences")
        menu.append("About HPC Hub", "app.about")
        menu.append("Disconnect all and quit…", "app.disconnect-quit")
        menu.append("Quit (keep everything running)", "app.quit")
        return menu

    def open_latex(self, session, path: str) -> None:
        self.latex.open(session, path)
        self.stack.set_visible_child_name("latex")

    def toast(self, text: str) -> None:
        self.toasts.add_toast(Adw.Toast(title=text, timeout=4))
