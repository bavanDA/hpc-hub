"""Settings > Back up: export HPC Hub's settings and saved logins to a file locked with a password, and import one
(core/settings_backup.py)."""

from ...core import settings_backup as backup
from ..server import method
from .reset import _cluster_ids


@method("backup_file.export")
def export(folder: str, password: str) -> dict:
    """Seal the settings and logins with password into a new file in folder."""
    from .app import version
    contents = backup.gather(_cluster_ids(), version().get("version", ""))
    path = backup.write(folder, contents, password)
    return {"path": str(path), **backup.summary(contents)}


@method("backup_file.inspect")
def inspect(path: str, password: str) -> dict:
    """What a backup holds (no passwords), to ask before importing it."""
    return backup.summary(backup.read(path, password))


@method("backup_file.restore")
def restore(path: str, password: str) -> dict:
    """Put the backup's settings and logins in place; the window reloads after."""
    return backup.restore(backup.read(path, password))
