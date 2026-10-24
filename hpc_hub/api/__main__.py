"""python -m hpc_hub.api: the backend the Tauri app starts."""

import sys

from . import methods  # noqa: F401 - registers the methods
from .server import Server

protocol = sys.stdout
sys.stdout = sys.stderr  # a stray print must never land in the protocol stream
Server(out=protocol).serve()
