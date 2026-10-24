"""The word you clicked in the PDF: how to say it, what it means, examples, and Read from here."""

from collections.abc import Callable

from gi.repository import Gtk, Pango

from ...ui.widgets import bg
from ..readaloud import dictionary


def _label(text: str, *classes: str, wrap: bool = True) -> Gtk.Label:
    return Gtk.Label(label=text, xalign=0, wrap=wrap, wrap_mode=Pango.WrapMode.WORD_CHAR, selectable=True,
                     css_classes=list(classes))


class DictionaryPanel(Gtk.Revealer):
    """on_say(entry) plays the word; on_read(id) reads aloud from that word."""

    def __init__(self, on_say: Callable[[dictionary.Entry], None], on_read: Callable[[int], None]):
        # hexpand off: its labels expand, and that would otherwise make the closed panel take space
        super().__init__(transition_type=Gtk.RevealerTransitionType.SLIDE_LEFT, reveal_child=False, hexpand=False)
        self.on_say, self.on_read = on_say, on_read
        self.token = 0
        self.word_id: int | None = None
        self.entry: dictionary.Entry | None = None

        head = Gtk.Box(spacing=6, margin_top=10, margin_start=12, margin_end=6)
        self.word = _label("", "title-2", wrap=False)
        self.word.set_hexpand(True)
        self.word.set_ellipsize(Pango.EllipsizeMode.END)
        close = Gtk.Button(icon_name="window-close-symbolic", css_classes=["flat", "circular"], tooltip_text="Close")
        close.connect("clicked", lambda *_: self.set_reveal_child(False))
        head.append(self.word)
        head.append(close)

        self.say_btn = Gtk.Button(icon_name="audio-volume-high-symbolic", css_classes=["flat", "circular"],
                                  tooltip_text="Hear it", valign=Gtk.Align.CENTER)
        self.say_btn.connect("clicked", lambda *_: self.entry and self.on_say(self.entry))
        self.sound = _label("", "dim-label")
        self.sound.set_hexpand(True)
        sound_row = Gtk.Box(spacing=4, margin_start=12, margin_end=6)
        sound_row.append(self.sound)
        sound_row.append(self.say_btn)

        self.read_btn = Gtk.Button(child=Gtk.Label(label="Read from here"), css_classes=["pill", "suggested-action"],
                                   margin_start=12, margin_end=12, margin_top=6, visible=False)
        self.read_btn.connect("clicked", lambda *_: self.word_id is not None and self.on_read(self.word_id))

        self.body = Gtk.Box(orientation=Gtk.Orientation.VERTICAL, spacing=6, margin_start=12, margin_end=12,
                            margin_top=8, margin_bottom=12)
        box = Gtk.Box(orientation=Gtk.Orientation.VERTICAL, width_request=300, css_classes=["background"])
        for w in (head, sound_row, self.read_btn,
                  Gtk.ScrolledWindow(child=self.body, vexpand=True, hscrollbar_policy=Gtk.PolicyType.NEVER)):
            box.append(w)
        frame = Gtk.Box()
        frame.append(Gtk.Separator(orientation=Gtk.Orientation.VERTICAL))
        frame.append(box)
        self.set_child(frame)

    def show_word(self, text: str, word_id: int | None) -> None:
        self.token += 1
        token = self.token
        self.word_id = word_id
        self.entry = None
        self.word.set_label(text)
        self.sound.set_label("Looking it up…")
        self.say_btn.set_sensitive(False)
        self.read_btn.set_visible(word_id is not None)
        self._clear()
        self.set_reveal_child(True)
        bg(lambda: dictionary.lookup(text), lambda e, err: token == self.token and self._show(e, err))

    def _clear(self) -> None:
        while child := self.body.get_first_child():
            self.body.remove(child)

    def _show(self, e: dictionary.Entry | None, err: str) -> None:
        if err or not e:
            self.sound.set_label(err or "Nothing found")
            self.say_btn.set_sensitive(True)  # it can still be spoken
            self.entry = dictionary.Entry(self.word.get_label())
            return
        self.entry = e
        self.word.set_label(e.word)
        self.sound.set_label("  ".join(x for x in (e.respelling, e.phonetic) if x) or "")
        self.say_btn.set_sensitive(True)
        for pos, senses in e.meanings:
            self.body.append(_label(pos.capitalize(), "heading"))
            for n, sense in enumerate(senses, 1):
                self.body.append(_label(f"{n}. {sense.definition}"))
                if sense.example:
                    self.body.append(_label(f"“{sense.example}”", "dim-label", "caption"))
                if sense.synonyms:
                    self.body.append(_label("Similar: " + ", ".join(sense.synonyms[:6]), "dim-label", "caption"))
        self.body.append(_label(f"From {e.source}", "dim-label", "caption"))
