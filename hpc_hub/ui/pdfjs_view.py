"""PDF view built on PDF.js in WebKit: sharp at any zoom, select and search text, highlight, save a copy.

Same small API as PdfView (load_bytes, show_message, scroll_to, on_double_click), so the LaTeX tab can use either.
"""

import base64
import json
import os
import time
from pathlib import Path

import gi

gi.require_version("WebKit", "6.0")
from gi.repository import Adw, GLib, Gtk, WebKit  # noqa: E402

SPEAK = (Path(__file__).parent / "readaloud.js").read_text(encoding="utf-8")
BRIDGE = r"""
document.addEventListener("webviewerloaded", () => {
  const o = PDFViewerApplicationOptions;
  o.set("defaultUrl", "");
  o.set("disablePreferences", true);
  o.set("sidebarViewOnLoad", 0);
  o.set("viewerCssTheme", 0);
  o.set("isEvalSupported", false);
});

async function viewerApp() {  // viewer.mjs is a module: it may start after the page "loaded"
  while (!window.PDFViewerApplication) await new Promise((r) => setTimeout(r, 50));
  await PDFViewerApplication.initializedPromise;
  return PDFViewerApplication;
}

window.hpchub = {
  async load(b64, keep) {
    const app = await viewerApp();
    const v = app.pdfViewer, c = app.appConfig.mainContainer;
    const was = keep && app.pdfDocument ? {scale: v.currentScaleValue, top: c.scrollTop, left: c.scrollLeft} : null;
    app.eventBus.on("pagesinit", () => setTimeout(() => {
      v.currentScaleValue = was ? was.scale : "page-width";
      if (was) { c.scrollTop = was.top; c.scrollLeft = was.left; }
    }, 0), {once: true});
    const raw = atob(b64), bytes = new Uint8Array(raw.length);
    for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
    await app.open({data: bytes});
  },
  async scrollTo(page, yTop) {
    const app = await viewerApp(), view = app.pdfViewer.getPageView(page - 1);
    if (!view) return;
    const top = (await app.pdfDocument.getPage(page)).view[3] - yTop;  // PDF space has y going up
    app.pdfViewer.scrollPageIntoView({pageNumber: page, destArray: [null, {name: "XYZ"}, null, top + 80, null]});
    const [, y] = view.viewport.convertToViewportPoint(0, top);
    const mark = document.createElement("div");
    mark.style.cssText = `position:absolute;left:0;right:0;top:${y - 14}px;height:4px;border-radius:2px;` +
      "background:rgba(53,132,228,.55);z-index:10;pointer-events:none;transition:opacity .6s";
    view.div.appendChild(mark);
    setTimeout(() => { mark.style.opacity = 0; setTimeout(() => mark.remove(), 700); }, 1200);
  },
};

// double click: jump to the source. It waits a moment, because a third click means "dictionary" instead.
window.hpchubSync = 0;
document.addEventListener("dblclick", (e) => {
  const div = e.target.closest && e.target.closest(".page");
  if (!div) return;
  const page = Number(div.dataset.pageNumber), view = PDFViewerApplication.pdfViewer.getPageView(page - 1);
  const r = div.getBoundingClientRect();
  const [x, y] = view.viewport.convertToPdfPoint(e.clientX - r.left, e.clientY - r.top);
  const msg = JSON.stringify({page, x, y: view.pdfPage.view[3] - y});
  clearTimeout(window.hpchubSync);
  window.hpchubSync = setTimeout(() => window.webkit.messageHandlers.hpchub.postMessage(msg), 300);
}, true);
"""


def _log(line: str) -> None:
    """Read-aloud player events, for when it misbehaves: ~/.cache/hpc-hub/readaloud.log"""
    base = os.environ.get("XDG_CACHE_HOME") or str(Path.home() / ".cache")
    f = Path(base) / "hpc-hub" / "readaloud.log"
    try:
        f.parent.mkdir(parents=True, exist_ok=True)
        with open(f, "a", encoding="utf-8") as out:
            out.write(time.strftime("%Y-%m-%d %H:%M:%S ") + line + "\n")
    except OSError:
        pass


class PdfJsView(Gtk.Box):
    def __init__(self, viewer_html: Path):
        super().__init__(orientation=Gtk.Orientation.VERTICAL)
        self.on_double_click = None  # (page 1-based, x, y in PDF points from the top) -> None
        self.on_speak_state = None  # ("playing" | "paused" | "ended") -> None
        self.on_word = None  # (word text, narration word id or None) -> None: you clicked a word
        self.filename = "document.pdf"  # name used when you save a copy
        self.ready = False
        self.pending: list[str] = []

        ucm = WebKit.UserContentManager()
        ucm.add_script(WebKit.UserScript.new(BRIDGE, WebKit.UserContentInjectedFrames.TOP_FRAME,
                                             WebKit.UserScriptInjectionTime.START, None, None))
        ucm.add_script(WebKit.UserScript.new(SPEAK, WebKit.UserContentInjectedFrames.TOP_FRAME,
                                             WebKit.UserScriptInjectionTime.START, None, None))
        ucm.register_script_message_handler("hpchub", None)
        ucm.connect("script-message-received::hpchub", self._message)
        self.web = WebKit.WebView(user_content_manager=ucm, vexpand=True, hexpand=True)
        s = self.web.get_settings()
        s.set_allow_file_access_from_file_urls(True)
        s.set_allow_universal_access_from_file_urls(True)
        self.web.connect("load-changed", self._loaded)
        self.web.connect("context-menu", lambda *_: False)
        self.web.get_network_session().connect("download-started", self._download)
        self.web.load_uri(viewer_html.as_uri())

        self.empty = Adw.StatusPage(icon_name="x-office-document-symbolic", title="No PDF")
        self.stack = Gtk.Stack(vexpand=True)
        self.stack.add_named(self.web, "pdf")
        self.stack.add_named(self.empty, "empty")
        self.append(self.stack)
        self.stack.set_visible_child_name("empty")

    def _loaded(self, _web, event) -> None:
        if event == WebKit.LoadEvent.FINISHED:
            self.ready = True
            for js in self.pending:
                self._js(js)
            self.pending.clear()

    def _js(self, js: str) -> None:
        if not self.ready:
            self.pending.append(js)
            return
        self.web.evaluate_javascript(js, -1, None, None, None, None, None)

    def _message(self, _ucm, value) -> None:
        try:
            msg = json.loads(value.to_string())
        except (ValueError, TypeError):
            return
        if msg.get("kind") == "speak":
            _log(f"{msg.get('state')} at {msg.get('at', 0):.1f}s {msg.get('error', '')}".rstrip())
            if self.on_speak_state:
                self.on_speak_state(msg.get("state", ""), msg.get("error", ""))
        elif msg.get("kind") == "word":
            if self.on_word:
                self.on_word(str(msg.get("text", "")), msg.get("id"))
        elif self.on_double_click:
            self.on_double_click(int(msg["page"]), float(msg["x"]), float(msg["y"]))

    def _download(self, _session, download) -> None:
        """The save button: put the copy (with your highlights) in Downloads/HPC Hub."""
        folder = Path(GLib.get_user_special_dir(GLib.UserDirectory.DIRECTORY_DOWNLOAD) or Path.home()) / "HPC Hub"
        stem = Path(self.filename).stem

        def destination(d, _suggested):
            folder.mkdir(parents=True, exist_ok=True)
            n, path = 1, folder / f"{stem}-highlighted.pdf"
            while path.exists():
                n += 1
                path = folder / f"{stem}-highlighted-{n}.pdf"
            d.set_destination(str(path))
            return True
        download.connect("decide-destination", destination)

    # -- same API as PdfView ----------------------------------------------------------------
    def load_bytes(self, data: bytes, keep_position: bool = True) -> None:
        self.stack.set_visible_child_name("pdf")
        b64 = base64.b64encode(data).decode()
        self._js(f"hpchub.load('{b64}', {'true' if keep_position else 'false'})")

    def show_message(self, title: str, text: str = "") -> None:
        self.empty.set_title(title)
        self.empty.set_description(GLib.markup_escape_text(text))
        self.stack.set_visible_child_name("empty")

    def scroll_to(self, page: int, y: float) -> None:
        self._js(f"hpchub.scrollTo({int(page)}, {float(y)})")

    # -- read aloud (readaloud.js) -------------------------------------------------------------
    def speak_load(self, audio: Path, words: list, timings: list) -> None:
        self._js(f"hpchubSpeak.load({json.dumps(audio.as_uri())}, {json.dumps(words)}, {json.dumps(timings)})"
                 ".then(() => hpchubSpeak.play(true))")

    def speak_play(self) -> None:
        self._js("hpchubSpeak.play(true)")

    def speak_pause(self) -> None:
        self._js("hpchubSpeak.pause()")

    def speak_rate(self, rate: float) -> None:
        self._js(f"hpchubSpeak.rate({float(rate)})")

    def speak_from(self, word_id: int) -> None:
        self._js(f"hpchubSpeak.seekWord({int(word_id)})")

    def say(self, url: str) -> None:
        self._js(f"hpchubSpeak.say({json.dumps(url)})")

    def speak_stop(self) -> None:
        self._js("hpchubSpeak.stop()")

    def fit_width(self) -> None:
        self._js("PDFViewerApplication.pdfViewer.currentScaleValue = 'page-width'")
