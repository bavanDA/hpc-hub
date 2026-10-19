"""SyncTeX jumps between the editor and the PDF."""

import posixpath

from ... import remote_fs, synctex
from ..widgets import bg


class SyncMixin:
    """LatexPage: self.sync is loaded after each build; Ctrl+J and PDF double-clicks use it."""

    def _load_sync(self) -> None:
        s, main = self.session, self.main
        path = posixpath.splitext(main)[0] + ".synctex.gz"

        def done(st, err):
            if main == self.main:
                self.sync = st
        bg(lambda: synctex.SyncTex.from_gz(remote_fs.read_bytes(s.ssh, path)), done)

    def show_in_pdf(self) -> None:
        if not self.sync:
            self.toast("Build once to link the PDF and the source")
            return
        spot = self.sync.view(self.current, self._cursor_line(), self.folder)
        if spot:
            self.pdf.scroll_to(spot.page, spot.y)
        else:
            self.toast("This line is not in the PDF")

    def show_in_source(self, page: int, x: float, y: float) -> None:
        """Double-click in the PDF: open the file and line that made that spot."""
        hit = self.sync.edit(page, x, y) if self.sync else None
        if not hit:
            self.toast("Build once to link the PDF and the source")
            return
        path, line = hit
        rel = next((f for f in self.files if path == posixpath.join(self.folder, f) or path.endswith("/" + f)), None)
        target = posixpath.join(self.folder, rel) if rel else path
        if target == self.current:
            self._jump(line)
        elif self.dirty:
            self.save(then=lambda: self._load_file(target, line))
        else:
            self._load_file(target, line)
