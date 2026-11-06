import json
import subprocess
import tempfile
from pathlib import Path

from . import env
from .text import Word

WORKER = Path(__file__).with_name("words_worker.py")


def extract(data: bytes, python: Path) -> list[Word]:
    """Every word of a PDF with its box, in reading order (PyMuPDF keeps two columns apart)."""
    try:
        with tempfile.NamedTemporaryFile(suffix=".pdf", delete_on_close=False) as f:
            f.write(data)
            f.close()  # Windows lets the worker open it only once it is closed
            res = subprocess.run([str(python), str(WORKER), f.name], capture_output=True, text=True, timeout=120,
                                 env=env.clean())
        if res.returncode == 0:
            return [Word(i, w[0], w[1], tuple(w[2:6])) for i, w in enumerate(json.loads(res.stdout))]
    except (OSError, ValueError, subprocess.TimeoutExpired):
        pass
    raise ValueError("Could not read the words of this PDF")
