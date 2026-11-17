"""Quick fixes (hpc_hub/core/quickfix.py): which one is in use, whether a newer one is out, and
installing it. The window restarts the app afterwards."""

from ...core import quickfix
from ..server import method


@method("updates.quick_fix")
def quick_fix() -> dict:
    """current: the fix installed; running: the one this start uses; offered: a newer one for this version (a beta's
    or a release's, Beta updates on or not)."""
    root = quickfix.folder()
    cur = quickfix.current(root) if root else None
    offered = None
    if root:
        fix = quickfix.check()
        offered = {"number": fix["number"], "notes": fix["notes"]} if fix else None
    return {"current": cur, "running": quickfix.running(), "offered": offered, "version": quickfix.app_version()}


@method("updates.quick_fix_install")
def quick_fix_install() -> dict:
    """Download and check the newest quick fix; it is used from the next start."""
    fix = quickfix.check()
    if not fix:
        raise RuntimeError("There is no newer quick fix for this version")
    try:
        return quickfix.install(fix)
    except quickfix.BadFix as e:
        raise RuntimeError(f"The quick fix wasn't installed: {e}") from None
