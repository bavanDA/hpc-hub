# PyInstaller: the Python backend (python -m hpc_hub.api) as one executable, hpc-hub-backend.
# Build with packaging/build_backend.py, which also puts it where Tauri looks for its sidecar.
from pathlib import Path

from PyInstaller.utils.hooks import collect_submodules

ROOT = Path(SPECPATH).parent
PKG = ROOT / "hpc_hub"


def files(folder: Path) -> list[tuple[str, str]]:
    """Every file under folder, at the same place inside the bundle."""
    return [(str(f), str(f.parent.relative_to(ROOT))) for f in folder.rglob("*")
            if f.is_file() and "__pycache__" not in f.parts]


def one(path: Path) -> tuple[str, str]:
    return str(path), str(path.parent.relative_to(ROOT))


datas = [
    *files(PKG / "agents" / "guard_files"),  # copied to the clusters
    *files(PKG / "agents" / "skill_catalog"),
    # run as scripts in their own Python, so they ship as source
    one(PKG / "pdf" / "readaloud" / "worker.py"),
    one(PKG / "pdf" / "readaloud" / "words_worker.py"),
    # ssh and openconnect start these by path (core/paths.py)
    one(ROOT / "bin" / "hpc-hub-askpass"),
    one(ROOT / "bin" / "hpc-hub-sso"),
    one(PKG / "connect" / "askpass.py"),
    one(PKG / "connect" / "sso.py"),
]

a = Analysis(
    [str(Path(SPECPATH) / "backend.py")],
    pathex=[str(ROOT)],
    datas=datas,
    # methods.load_all() finds these at run time, so the analysis can't see them; ssh_async is imported only
    # where it is the login (Windows), and asyncssh picks some of its parts at run time
    hiddenimports=[*collect_submodules("hpc_hub.api.methods"), "hpc_hub.core.ssh_async", "hpc_hub.core.ssh_bridge",
                   *collect_submodules("asyncssh")],
    excludes=["gi", "tkinter"],  # no GTK in the backend: credentials falls back to keyring
    noarchive=False,
)
pyz = PYZ(a.pure)
exe = EXE(
    pyz,
    a.scripts,
    a.binaries,
    a.datas,
    [],
    name="hpc-hub-backend",
    console=True,  # stdin/stdout carry the JSON-RPC; the Tauri app hides the window on Windows
    upx=False,
    strip=False,
)
