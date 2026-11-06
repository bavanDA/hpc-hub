from ....latex import assist, history
from ...server import method
from .agent import start, uncommitted


@method("latex.agent_write")
def agent_write(cluster: str, folder: str, split: bool = True, choice: dict | None = None) -> dict:
    """A commit message for the changes not committed yet, maybe split into commits. Nothing is committed."""
    def build(ssh):
        st, ch = uncommitted(ssh, folder)
        subjects = [x["subject"] for x in history.log(ssh, folder, "HEAD", assist.SUBJECTS, stats=False)]
        paths = [f["path"] for f in st["changes"]]
        prompt = assist.message_prompt(assist.diff_text(ch), st["changes"], subjects, bool(split))
        about = {"files": len(paths), "lines": sum(f["added"] + f["removed"] for f in st["changes"])}
        return prompt, lambda text: {**assist.parse_message(text, paths), "files": st["changes"],
                                     "head": st["head"]}, about
    return start("write", cluster, folder, choice, build)
