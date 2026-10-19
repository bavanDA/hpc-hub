"""PDF viewer widget (Poppler): continuous pages, zoom, reload keeps your place."""

import math

import cairo
import gi

gi.require_version("Poppler", "0.18")
from gi.repository import Adw, Gdk, GLib, Graphene, Gtk, Poppler  # noqa: E402

ZOOMS = [0.5, 0.67, 0.8, 1.0, 1.25, 1.5, 2.0, 3.0]


def render_page(page: Poppler.Page, scale: float) -> Gdk.Texture:
    w, h = page.get_size()
    width, height = max(1, math.ceil(w * scale)), max(1, math.ceil(h * scale))
    surface = cairo.ImageSurface(cairo.FORMAT_ARGB32, width, height)
    ctx = cairo.Context(surface)
    ctx.set_source_rgb(1, 1, 1)
    ctx.paint()
    ctx.scale(scale, scale)
    page.render(ctx)
    surface.flush()
    data = GLib.Bytes.new(bytes(surface.get_data()))
    return Gdk.MemoryTexture.new(width, height, Gdk.MemoryFormat.B8G8R8A8_PREMULTIPLIED, data, surface.get_stride())


class PdfView(Gtk.Box):
    def __init__(self):
        super().__init__(orientation=Gtk.Orientation.VERTICAL)
        self.doc: Poppler.Document | None = None
        self.zoom = 1.0
        self.on_double_click = None  # (page 1-based, x, y in PDF points from top left) -> None
        self.marker: Gtk.Widget | None = None

        bar = Gtk.Box(spacing=6, margin_top=6, margin_bottom=6, margin_start=6, margin_end=6)
        self.info = Gtk.Label(hexpand=True, xalign=0, css_classes=["dim-label", "caption"])
        out = Gtk.Button(icon_name="zoom-out-symbolic", tooltip_text="Zoom out")
        self.zoom_label = Gtk.Label(width_chars=5, css_classes=["numeric"])
        zin = Gtk.Button(icon_name="zoom-in-symbolic", tooltip_text="Zoom in")
        fit = Gtk.Button(icon_name="zoom-fit-best-symbolic", tooltip_text="Fit width")
        out.connect("clicked", lambda *_: self._step(-1))
        zin.connect("clicked", lambda *_: self._step(1))
        fit.connect("clicked", lambda *_: self.fit_width())
        for w in (self.info, out, self.zoom_label, zin, fit):
            bar.append(w)
        self.append(bar)

        self.pages = Gtk.Box(orientation=Gtk.Orientation.VERTICAL, spacing=12, halign=Gtk.Align.CENTER,
                             margin_top=12, margin_bottom=12)
        self.scroller = Gtk.ScrolledWindow(child=self.pages, vexpand=True, hexpand=True)
        self.empty = Adw.StatusPage(icon_name="x-office-document-symbolic", title="No PDF")
        self.stack = Gtk.Stack()
        self.stack.add_named(self.scroller, "pdf")
        self.stack.add_named(self.empty, "empty")
        self.append(self.stack)
        self.stack.set_visible_child_name("empty")

    def load_bytes(self, data: bytes, keep_position: bool = True) -> None:
        pos = self.scroller.get_vadjustment().get_value() if keep_position else 0
        try:
            self.doc = Poppler.Document.new_from_bytes(GLib.Bytes.new(data), None)
        except GLib.Error as e:
            self.show_message("Could not open PDF", e.message)
            return
        first = not self.pages.get_first_child()
        self._render()
        if first:
            GLib.timeout_add(100, lambda: self.fit_width() and False)
        GLib.idle_add(lambda: self.scroller.get_vadjustment().set_value(pos) and False)

    def show_message(self, title: str, text: str = "") -> None:
        self.empty.set_title(title)
        self.empty.set_description(GLib.markup_escape_text(text))
        self.stack.set_visible_child_name("empty")

    def _render(self) -> None:
        while child := self.pages.get_first_child():
            self.pages.remove(child)
        if not self.doc:
            return
        for i in range(self.doc.get_n_pages()):
            page = self.doc.get_page(i)
            pic = Gtk.Picture.new_for_paintable(render_page(page, self.zoom * self._dpi()))
            pic.set_can_shrink(False)
            pic.add_css_class("card")
            click = Gtk.GestureClick()
            click.connect("pressed", self._clicked, i)
            pic.add_controller(click)
            overlay = Gtk.Overlay(child=pic)
            self.pages.append(overlay)
        self.info.set_label(f"{self.doc.get_n_pages()} pages")
        self.zoom_label.set_label(f"{round(self.zoom * 100)}%")
        self.stack.set_visible_child_name("pdf")

    def _clicked(self, gesture: Gtk.GestureClick, n: int, x: float, y: float, index: int) -> None:
        if n != 2 or not self.on_double_click or not self.doc:
            return
        pic = gesture.get_widget()
        w, h = self.doc.get_page(index).get_size()
        self.on_double_click(index + 1, x * w / max(pic.get_width(), 1), y * h / max(pic.get_height(), 1))

    def scroll_to(self, page: int, y: float) -> None:
        """Bring a spot (PDF points from the page top) into view and mark it for a moment."""
        overlay = self.pages.get_first_child()
        for _ in range(page - 1):
            overlay = overlay.get_next_sibling() if overlay else None
        if not overlay or not self.doc:
            return
        _, h = self.doc.get_page(page - 1).get_size()
        ok, point = overlay.compute_point(self.pages, Graphene.Point().init(0, 0))
        top = point.y if ok else 0
        px = y * overlay.get_height() / h
        adj = self.scroller.get_vadjustment()
        adj.set_value(max(0, top + px - adj.get_page_size() / 3))
        if self.marker and self.marker.get_parent():
            self.marker.get_parent().remove_overlay(self.marker)
        self.marker = Gtk.Box(css_classes=["synctex-mark"], height_request=4, valign=Gtk.Align.START,
                              margin_top=max(0, int(px) - 12), can_target=False)
        overlay.add_overlay(self.marker)
        mark = self.marker
        GLib.timeout_add(1500, lambda: mark.get_parent() and mark.get_parent().remove_overlay(mark) and False)

    def _dpi(self) -> float:
        return self.get_scale_factor() or 1

    def _step(self, direction: int) -> None:
        nearest = min(range(len(ZOOMS)), key=lambda i: abs(ZOOMS[i] - self.zoom))
        self.zoom = ZOOMS[max(0, min(len(ZOOMS) - 1, nearest + direction))]
        self._render()

    def fit_width(self) -> None:
        if not self.doc or not self.doc.get_n_pages():
            return
        w, _ = self.doc.get_page(0).get_size()
        avail = self.scroller.get_width() - 40
        if avail > 100:
            self.zoom = avail / w
            self._render()


class PdfDialog(Adw.Dialog):
    def __init__(self, title: str, data: bytes):
        super().__init__(title=title, content_width=900, content_height=1000)
        self.view = PdfView()
        toolbar = Adw.ToolbarView(content=self.view)
        toolbar.add_top_bar(Adw.HeaderBar())
        self.set_child(toolbar)
        self.view.load_bytes(data, keep_position=False)
