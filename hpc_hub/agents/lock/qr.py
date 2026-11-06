"""The authenticator app's QR code, drawn by qrencode."""

import base64
import shutil
import subprocess


def qr_png(text: str) -> str:
    """A data: URL of the QR code, or "" without qrencode (then the key is typed by hand)."""
    if not shutil.which("qrencode"):
        return ""
    res = subprocess.run(["qrencode", "-t", "PNG", "-s", "6", "-m", "2", "-o", "-"], input=text.encode(),
                         capture_output=True)
    return "data:image/png;base64," + base64.b64encode(res.stdout).decode() if res.returncode == 0 else ""


def grouped(secret: str) -> str:
    """"ABCD EFGH IJ": the key in fours, easier to type."""
    return " ".join(secret[i:i + 4] for i in range(0, len(secret), 4))
