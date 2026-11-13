"""python -m hpc_hub.api: the backend the Tauri app starts."""

import sys

from ..core import hostenv

hostenv.apply()  # before anything starts a program or opens TLS: as on this computer, not as in the bundle

from . import health, hub, methods  # noqa: E402
from .server import Server  # noqa: E402

protocol = sys.stdout
sys.stdout = sys.stderr  # a stray print must never land in the protocol stream
methods.load_all()
server = Server(out=protocol)
hub.start(server.emit)
health.start()
server.serve()
