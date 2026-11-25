"""GitHub sign-in for the Papers' git. Every git command that talks to a remote goes through net(): when GitHub's own
gh is there and signed in, git asks gh for github.com's https sign-in, and only for github.com (other hosts keep your
own helpers). Nothing is written to ~/.gitconfig or ~/.git-credentials, and no token is ever printed. When GitHub
turns a sign-in down, explain() says why in plain words, with what to do (kind "github-auth" for the app)."""

import re
import shlex

from ..core.ssh import SshMaster
from .git import ENV, GitError

# gh on PATH, or in ~/.local/bin where its release goes: HPC Hub's shells start without ~/.bashrc, so its PATH may
# be missing. Leaves the path (or "") in $hpchub_gh.
FIND_GH = ('hpchub_gh=$(command -v gh 2>/dev/null); '
           '[ -n "$hpchub_gh" ] || { [ -x "$HOME/.local/bin/gh" ] && hpchub_gh="$HOME/.local/bin/gh"; }; ')

HELPER = "credential.https://github.com.helper"
# The flags for git, in "$@" (POSIX sh has no arrays; HPC Hub's scripts use no arguments of their own), so they
# also pass through timeout. The empty value first clears the helpers set for github.com (credential.helper=store
# with an old token), then gh answers. `gh auth token` only reads gh's own file, with no network.
SETUP = (FIND_GH + 'set --; if [ -n "$hpchub_gh" ] && "$hpchub_gh" auth token --hostname github.com >/dev/null 2>&1; '
         f"then set -- -c {HELPER}= -c '{HELPER}=!'\"\\\"$hpchub_gh\\\" auth git-credential\"; fi; ")


def net(folder: str, args: str) -> str:
    """git <args> in folder, for a command that talks to a remote (fetch, pull, push, ls-remote)."""
    return f'{SETUP}{ENV} git "$@" -C {shlex.quote(folder)} {args}'


# What git and GitHub say when the sign-in is wrong or missing, or the account has no access
_AUTH = re.compile("|".join([
    r"returned error: 40[13]", r"authentication failed", r"could not read (username|password)",
    r"write access to repository not granted", r"permission to \S+ denied", r"repository not found",
    r"invalid username or (password|token)", r"password authentication was removed", r"terminal prompts disabled",
    r"bad credentials",
]), re.IGNORECASE)
_URL = re.compile(r"https://(?:[^/@\s']*@)?github\.com/([^/\s']+/[^/\s']+?)(?:\.git)?/?(?=$|['\s])")
_SAID = re.compile(r"^remote: (.+?)\.?\s*$", re.MULTILINE)
_WHO = re.compile(r"Logged in to github\.com (?:account|as) ([A-Za-z0-9-]+)")


def auth_failed(text: str) -> bool:
    """git's error is about the sign-in: GitHub turned it down, or there is none (no prompt in the app)."""
    return bool(_AUTH.search(text or ""))


def repo_of(url: str) -> str:
    """owner/name of an https github.com address; "" for any other (ssh remotes use your keys, not gh)."""
    m = _URL.search(url or "")
    return m.group(1) if m else ""


class GitHubAuth(GitError):
    """GitHub turned down git's sign-in. gh: missing (not installed), signed-out, or no-access (signed in as
    account, which can't reach repo). The app shows how to sign in with gh."""
    kind = "github-auth"

    def __init__(self, message: str, gh: str, account: str = "", repo: str = ""):
        super().__init__(message)
        self.details = {"gh": gh, "account": account, "repo": repo}


def message(gh: str, repo: str, account: str = "", said: str = "") -> str:
    """One line, as the app shows the last line of an error."""
    what = repo or "this repository"
    if gh == "missing":
        return (f"GitHub turned down git's sign-in for {what}. Sign in with gh, GitHub's own tool: HPC Hub can "
                "install it in your home folder, no root needed, and then uses it for github.com.")
    if gh == "signed-out":
        return (f"GitHub turned down git's sign-in for {what}. gh is installed but not signed in (or its sign-in "
                "ran out): sign in with it, and HPC Hub uses it for github.com.")
    told = f" (GitHub said: {said})" if said else ""
    return (f"gh is signed in to GitHub as {account}, and that account has no access to {what}{told}. Ask the "
            f"owner to add {account}, or sign in with gh as the account that has access.")


def _look(folder: str, remote: str) -> str:
    G = f"{ENV} git -C {shlex.quote(folder)}"
    here = f'"branch.$({G} branch --show-current).remote"'
    r = shlex.quote(remote) if remote else f'"$({G} config --get {here} || echo origin)"'
    gh = '"$hpchub_gh"'
    # the address without what may sit before @ (a token in the URL), and only gh's "Logged in" line
    return (f"{FIND_GH}echo \"@url=$({G} remote get-url {r} 2>/dev/null | sed 's#//[^/@]*@#//#')\"; "
            f'echo "@gh=$hpchub_gh"; if [ -n "$hpchub_gh" ]; then '
            f"{gh} auth token --hostname github.com >/dev/null 2>&1 && echo @token=1; "
            f"echo \"@who=$({{ {gh} auth status --active --hostname github.com 2>&1 || "
            f"{gh} auth status --hostname github.com 2>&1; }} | grep -o 'Logged in to github.com [a-z]* [^ ]*' "
            "| head -n 1)\"; fi; true")


def explain(ssh: SshMaster, folder: str, remote: str, err: str, before: str = "", after: str = "") -> GitHubAuth | None:
    """The GitHubAuth to raise for git's error err, or None when it isn't GitHub turning down the sign-in.
    before and after go around the message ("Nothing was pushed: ")."""
    if not auth_failed(err):
        return None
    try:
        out = ssh.run(_look(folder, remote), timeout=45).stdout
    except Exception:  # noqa: BLE001 (a look that fails leaves git's own words)
        return None
    got = dict(line[1:].split("=", 1) for line in out.splitlines() if line.startswith("@") and "=" in line)
    repo = repo_of(got.get("url", "")) or repo_of(err)
    if not repo:
        return None
    who = _WHO.search(got.get("who", ""))
    if not got.get("gh", "").strip():
        gh, account = "missing", ""
    elif not got.get("token") or not who:
        gh, account = "signed-out", ""
    else:
        gh, account = "no-access", who.group(1)
    said = next((s for s in _SAID.findall(err) if auth_failed(s) or "denied" in s.lower()), "")
    return GitHubAuth(before + message(gh, repo, account, said) + after, gh, account, repo)
