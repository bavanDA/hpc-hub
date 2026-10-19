"""The LaTeX tab's PDF: PDF.js once it is downloaded (first use), the simple Poppler view until then."""

from gi.repository import Gtk

from .. import pdfjs
from .pdf import PdfView
from .widgets import bg


class PdfPane(Gtk.Stack):
    def __init__(self, toast=lambda text: None):
        super().__init__(vexpand=True, hexpand=True)
        self.toast = toast
        self._on_double_click = None
        self.filename = "document.pdf"
        self.last: tuple[bytes, bool] | None = None
        self.view = PdfView()
        self.add_named(self.view, "simple")
        html = pdfjs.viewer()
        if html:
            self._use_pdfjs(html)
        else:
            bg(pdfjs.install, lambda html, err: self._use_pdfjs(html) if html else
               self.toast(f"Using the simple PDF view ({err})"))

    def _use_pdfjs(self, html) -> None:
        from .pdfjs_view import PdfJsView
        view = PdfJsView(html)
        view.on_double_click = self._on_double_click
        view.filename = self.filename
        self.add_named(view, "pdfjs")
        self.set_visible_child(view)
        self.view = view
        if self.last:
            view.load_bytes(self.last[0], False)

    @property
    def on_double_click(self):
        return self._on_double_click

    @on_double_click.setter
    def on_double_click(self, fn) -> None:
        self._on_double_click = fn
        self.view.on_double_click = fn

    def set_filename(self, name: str) -> None:
        self.filename = name
        if hasattr(self.view, "filename"):
            self.view.filename = name

    def load_bytes(self, data: bytes, keep_position: bool = True) -> None:
        self.last = (data, keep_position)
        self.view.load_bytes(data, keep_position)

    def show_message(self, title: str, text: str = "") -> None:
        self.view.show_message(title, text)

    def scroll_to(self, page: int, y: float) -> None:
        self.view.scroll_to(page, y)

    def fit_width(self) -> None:
        self.view.fit_width()
