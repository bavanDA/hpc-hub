"""The LaTeX tab's PDF: PDF.js once it is downloaded (first use), the simple Poppler view until then.
With PDF.js it can also read the PDF aloud, highlighting each word as it is spoken."""

from gi.repository import Adw, GLib, Gtk, Pango

from .. import pdfjs
from ..readaloud import narration
from .dictionary_panel import DictionaryPanel
from .pdf import PdfView
from .widgets import bg

SPEEDS = [0.75, 1.0, 1.25, 1.5, 1.75, 2.0]


class PdfPane(Gtk.Box):
    def __init__(self, toast=lambda text: None):
        super().__init__(orientation=Gtk.Orientation.VERTICAL, vexpand=True, hexpand=True)
        self.toast = toast
        self._on_double_click = None
        self.filename = "document.pdf"
        self.last: tuple[bytes, bool] | None = None
        self.narrated: bytes | None = None  # the PDF the loaded narration belongs to
        self.speaking = False
        self.recording = False

        self.reader = Gtk.Box(spacing=6, margin_top=4, margin_bottom=4, margin_start=6, margin_end=6,
                              visible=False)
        self.play = Gtk.Button(child=Adw.ButtonContent(label="Read aloud", icon_name="media-playback-start-symbolic"),
                               tooltip_text="Read the PDF aloud from the page you are on. Click any word to look it up.")
        self.play.connect("clicked", lambda *_: self._toggle())
        self.voice = Gtk.DropDown.new_from_strings([label for _, label in narration.VOICES])
        self.voice.connect("notify::selected", lambda *_: self._reset())
        self.speed = Gtk.DropDown.new_from_strings([f"{s:g}x" for s in SPEEDS])
        self.speed.set_selected(1)
        self.speed.connect("notify::selected", lambda *_: self._rate())
        self.status = Gtk.Label(xalign=0, hexpand=True, ellipsize=Pango.EllipsizeMode.END, css_classes=["dim-label", "caption"])
        self.spin = Adw.Spinner(visible=False)
        for w in (self.play, self.voice, self.speed, self.spin, self.status):
            self.reader.append(w)
        self.append(self.reader)

        self.stack = Gtk.Stack(vexpand=True, hexpand=True)
        self.words = DictionaryPanel(self._say, self._read_from)
        middle = Gtk.Box(vexpand=True)
        middle.append(self.stack)
        middle.append(self.words)
        self.append(middle)
        self.view = PdfView()
        self.stack.add_named(self.view, "simple")
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
        view.on_speak_state = self._speak_state
        view.on_word = self.words.show_word
        view.filename = self.filename
        self.stack.add_named(view, "pdfjs")
        self.stack.set_visible_child(view)
        self.view = view
        self.reader.set_visible(True)
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
        if self.last and self.last[0] != data:
            self._reset()  # a new build: the old narration no longer fits
        self.last = (data, keep_position)
        self.view.load_bytes(data, keep_position)

    # -- read aloud ------------------------------------------------------------------------
    def _reset(self) -> None:
        if hasattr(self.view, "speak_stop"):
            self.view.speak_stop()
        self.narrated = None
        self._speak_state("stopped")

    def _rate(self) -> None:
        if hasattr(self.view, "speak_rate"):
            self.view.speak_rate(SPEEDS[self.speed.get_selected()])

    def _toggle(self) -> None:
        if self.recording or not self.last or not hasattr(self.view, "speak_play"):
            return
        if self.speaking:
            self.view.speak_pause()
        elif self.narrated is self.last[0]:
            self.view.speak_play()
        else:
            self._record(self.last[0], narration.VOICES[self.voice.get_selected()][0])

    def _record(self, pdf: bytes, voice: str) -> None:
        self.recording = True
        self.spin.set_visible(True)
        self.status.set_label("Getting the voice ready…")

        def progress(text):
            GLib.idle_add(lambda: self.status.set_label(text) and False)

        def done(n, err):
            self.recording = False
            self.spin.set_visible(False)
            if err or not n:
                self.status.set_label("")
                self.toast(f"Could not read aloud: {err}")
                return
            if not self.last or self.last[0] is not pdf:
                self.status.set_label("")
                return  # rebuilt while recording; press again for the new one
            self.narrated = pdf
            minutes = int(n.duration // 60)
            self.status.set_label(f"{minutes} min of reading. Click a word to look it up or read from there.")
            self.view.speak_load(n.audio, n.words, n.timings)  # starts playing once loaded
            GLib.timeout_add(1500, lambda: self._rate() and False)
        bg(lambda: narration.build(pdf, voice, progress), done)

    def _say(self, entry) -> None:
        """Play the word: the dictionary's recording, or the reader voice saying it."""
        if entry.audio:
            self.view.say(entry.audio)
            return
        voice = narration.VOICES[self.voice.get_selected()][0]
        bg(lambda: narration.say(entry.word, voice),
           lambda path, err: self.toast(f"Could not say it: {err}") if err else self.view.say(path.as_uri()))

    def _read_from(self, word_id: int) -> None:
        if self.narrated is not None and self.last and self.narrated is self.last[0]:
            self.view.speak_from(word_id)

    def _speak_state(self, state: str) -> None:
        self.speaking = state == "playing"
        playing = self.speaking
        self.play.set_child(Adw.ButtonContent(label="Pause" if playing else "Read aloud",
                                              icon_name="media-playback-pause-symbolic" if playing
                                              else "media-playback-start-symbolic"))

    def show_message(self, title: str, text: str = "") -> None:
        self.view.show_message(title, text)

    def scroll_to(self, page: int, y: float) -> None:
        self.view.scroll_to(page, y)

    def fit_width(self) -> None:
        self.view.fit_width()
