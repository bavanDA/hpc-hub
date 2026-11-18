"""Settings > Reset HPC Hub and Uninstall HPC Hub (core/reset.py). The window disconnects first, asks before either,
and quits right after: the folders go once it has closed."""

from ...core import config, reset
from ..server import method


def _cluster_ids() -> list[str]:
    from ..hub import hub
    ids = [c.id for c in hub().clusters]
    try:
        ids += [c.id for c in config.load()]
    except (OSError, ValueError):
        pass
    return list(dict.fromkeys(ids))


@method("app.reset_info")
def info() -> dict:
    """What a reset removes and keeps, as the confirmation shows it."""
    from ..hub import hub
    return {"folders": [reset.shown(p) for p in reset.places() if p.exists()],
            "clusters": [c.name for c in hub().clusters],
            "kept": ["Your SSH keys and known hosts (~/.ssh)", "Your files and jobs on the clusters"]}


@method("app.reset")
def reset_app() -> dict:
    """Forget the saved logins now; remove the folders once the app has quit. The window quits next."""
    forgot = reset.forget_logins(_cluster_ids())
    reset.after_quit([p for p in reset.places() if p.exists()], [])
    return {"logins": forgot}


@method("app.uninstall")
def uninstall(erase: bool = True) -> dict:
    """Remove HPC Hub: its VPN helper (asks for permission), its data when erase, then the app itself after it quits
    (Windows runs its uninstaller, macOS moves the app to the Trash, Linux removes the AppImage and menu entry).
    Nothing is removed when the app itself can't be (raises first)."""
    files, then = reset.uninstall_step()
    notes: list[str] = []
    reset.remove_vpn_helper(notes.append)
    forgot = reset.forget_logins(_cluster_ids()) if erase else 0
    folders = [p for p in reset.places() if p.exists()] if erase else []
    reset.after_quit(folders + files, then)
    return {"logins": forgot, "notes": notes}
