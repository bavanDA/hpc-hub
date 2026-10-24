"""python -m hpc_hub.api: the backend the Tauri app starts."""

import sys

from . import hub, methods
from .server import Server

protocol = sys.stdout
sys.stdout = sys.stderr  # a stray print must never land in the protocol stream
methods.load_all()
server = Server(out=protocol)
hub.start(server.emit)
server.serve()
