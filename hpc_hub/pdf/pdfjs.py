"""PDF.js (Mozilla's PDF viewer) fetched once into ~/.local/share/hpc-hub, checked against a pinned hash."""

import hashlib
import io
import os
import shutil
import urllib.request
import zipfile
from pathlib import Path

VERSION = "6.3.289"
URL = f"https://github.com/mozilla/pdf.js/releases/download/v{VERSION}/pdfjs-{VERSION}-dist.zip"
SHA256 = "98c5832ffe7af4edd59853476a478c0d4d4d76dd49c1701f4c86f7182725cdf9"


def folder() -> Path:
    base = os.environ.get("XDG_DATA_HOME") or str(Path.home() / ".local" / "share")
    return Path(base) / "hpc-hub" / f"pdfjs-{VERSION}"


def viewer() -> Path | None:
    html = folder() / "web" / "viewer.html"
    return html if html.exists() else None


def install(url: str = URL, sha256: str = SHA256) -> Path:
    """Download, verify and unpack. Blocking; run off the UI thread."""
    with urllib.request.urlopen(url, timeout=60) as resp:
        data = resp.read()
    if hashlib.sha256(data).hexdigest() != sha256:
        raise ValueError("PDF viewer download did not match its checksum")
    dest = folder()
    tmp = dest.with_name(dest.name + ".part")
    shutil.rmtree(tmp, ignore_errors=True)
    with zipfile.ZipFile(io.BytesIO(data)) as z:
        for name in z.namelist():  # no absolute paths or ".." in the archive
            if name.startswith("/") or ".." in Path(name).parts:
                raise ValueError(f"Unsafe path in archive: {name}")
        z.extractall(tmp)
    shutil.rmtree(dest, ignore_errors=True)
    tmp.rename(dest)
    return dest / "web" / "viewer.html"
