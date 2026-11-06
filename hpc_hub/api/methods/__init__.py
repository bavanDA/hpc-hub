"""One module per feature; every module here is loaded at start."""

import importlib
import pkgutil


def load_all() -> None:
    for m in pkgutil.iter_modules(__path__):
        importlib.import_module(f"{__name__}.{m.name}")
