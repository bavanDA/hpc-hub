import secrets
import threading
import time

from ....latex import pdfdiff
from ...hub import hub
from ...server import method
from .build import where_built


@method("latex.git_pdf")
def git_pdf(cluster: str, folder: str, main: str, version: str = "", against: str | None = None) -> dict:
    """The PDF of a version ("" = the files now), or with against latexdiff's red and blue from against to version.
    {path} when it is kept already, else {id} and a `latex-git-pdf` event at the end."""
    s = hub().connected(cluster)
    p = pdfdiff.plan(s.ssh, folder, main, version, against, s.cfg.latex)
    if p["cached"]:
        return {"path": p["pdf"]}
    command = where_built(cluster, p["script"])
    jid, started = secrets.token_hex(6), time.monotonic()

    def run():
        try:
            res = s.ssh.run(command, timeout=900)
            ok = res.returncode == 0
            error = "" if ok else pdfdiff.explain(res.returncode, res.stdout + res.stderr, s.cfg.name,
                                                  against is not None)
        except Exception as e:  # noqa: BLE001 (it goes to the app as the build's end)
            ok, error = False, str(e)
        hub().emit("latex-git-pdf", {"id": jid, "cluster": cluster, "folder": folder, "ok": ok,
                                     "path": p["pdf"] if ok else "", "error": error,
                                     "seconds": round(time.monotonic() - started, 1)})
    threading.Thread(target=run, daemon=True, name=f"git-pdf-{jid}").start()
    return {"id": jid}
