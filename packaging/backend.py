"""Entry point of the frozen backend: the same as python -m hpc_hub.api.

With --ssh-bridge it is the bridge instead (hpc_hub/core/ssh_bridge.py): the asyncssh login runs local ssh
command lines through it, since a frozen app has no python to start that file with.

A quick fix (hpc_hub/core/quickfix.py) puts its hpc_hub first on the path: PyInstaller finds its own modules
through a path entry, so a folder ahead of it wins. If the fix doesn't import, the built-in package runs."""

import os
import sys

FIX = os.environ.get("HPC_HUB_QUICKFIX_PY", "")


def _without_fix() -> None:
    sys.path.remove(FIX)
    for name in [m for m in sys.modules if m == "hpc_hub" or m.startswith("hpc_hub.")]:
        del sys.modules[name]
    os.environ.pop("HPC_HUB_QUICKFIX_NUMBER", None)


if FIX and os.path.isfile(os.path.join(FIX, "hpc_hub", "__init__.py")):
    sys.path.insert(0, FIX)
    try:
        from hpc_hub.core import hostenv

        hostenv.apply()  # first, as python -m hpc_hub.api does; it does the same again there
        import hpc_hub.api.hub  # noqa: F401  # with the methods, nearly the whole package
        import hpc_hub.api.methods
        import hpc_hub.api.server  # noqa: F401

        hpc_hub.api.methods.load_all()
    except Exception as e:  # noqa: BLE001  # e.g. it needs a library this build doesn't have
        print(f"hpc-hub: the quick fix didn't load ({e!r}); running the built-in version", file=sys.stderr)
        _without_fix()

if sys.argv[1:2] == ["--ssh-bridge"]:
    from hpc_hub.core import ssh_bridge

    sys.exit(ssh_bridge.main(sys.argv[2:]))

if sys.platform == "win32":  # the UI's JSON is UTF-8 (passwords, file names), not the console's code page
    sys.stdin.reconfigure(encoding="utf-8")
    sys.stdout.reconfigure(encoding="utf-8")

import hpc_hub.api.__main__  # noqa: E402, F401
