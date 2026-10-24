"""One module per feature (clusters.py, jobs.py, ...). Every module here is loaded at start, so adding a feature
never means editing a shared file."""

import importlib
import pkgutil


def load_all() -> None:
    for m in pkgutil.iter_modules(__path__):
        importlib.import_module(f"{__name__}.{m.name}")
