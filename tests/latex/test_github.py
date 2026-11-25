"""The Papers' git and GitHub: gh signs in for github.com when it is there and signed in (only for github.com), and a
sign-in GitHub turns down is explained. A stand-in gh (a small sh script) and local repositories stand in for the
cluster's; jdoe, octocat-example and example/paper are made up."""

import os
import shutil
import subprocess

import pytest

from hpc_hub.latex import github, sync
from hpc_hub.latex.git import GitError
from tests.helpers import GNU_PATH, LocalShell, on_linux_cluster

FAKE_GH = r"""#!/bin/sh
# a stand-in for GitHub's gh: signed in when ~/gh-signed-in exists, as octocat-example
case "$1 $2" in
  "auth token") [ -f "$HOME/gh-signed-in" ] || exit 1; echo gho_not_a_real_token;;
  "auth git-credential")
    while read -r line; do [ -z "$line" ] && break; done
    if [ "$3" = get ] && [ -f "$HOME/gh-signed-in" ]; then echo username=x-access-token; echo password=from-gh; fi;;
  "auth status")
    [ -f "$HOME/gh-signed-in" ] || { echo "You are not logged into any GitHub hosts." >&2; exit 1; }
    printf 'github.com\n  \342\234\223 Logged in to github.com account octocat-example (keyring)\n' >&2
    echo "  - Token: gho_************************************" >&2;;
  *) exit 2;;
esac
"""

def _tools_without_gh(tools):
    """Every program on PATH but gh (CI runners and laptops have a real one), as links in tools."""
    for d in GNU_PATH + os.environ.get("PATH", "").split(os.pathsep):
        if not os.path.isdir(d):
            continue
        for name in os.listdir(d):
            src, dst = os.path.join(d, name), tools / name
            if name != "gh" and not dst.exists() and os.path.isfile(src) and os.access(src, os.X_OK):
                dst.symlink_to(src)


def _bin(path, text):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(text)
    path.chmod(0o755)
    return path


@pytest.fixture
def home(tmp_path, monkeypatch):
    """A cluster home with no gh on PATH: tools/ has only the usual tools, bin/ is first for stand-ins."""
    h, tools, fake = tmp_path / "home", tmp_path / "tools", tmp_path / "bin"
    for d in (h, tools, fake):
        d.mkdir()
    _tools_without_gh(tools)
    monkeypatch.setenv("HOME", str(h))
    monkeypatch.setenv("PATH", f"{fake}:{tools}")
    for k in ("GH_TOKEN", "GITHUB_TOKEN", "GH_CONFIG_DIR", "GIT_CONFIG_GLOBAL", "XDG_CONFIG_HOME"):
        monkeypatch.delenv(k, raising=False)
    return h


def _flags(home):
    out = subprocess.run(["bash", "--norc", "--noprofile", "-c", github.SETUP + 'printf "%s\\n" "$@"'],
                         capture_output=True, text=True, timeout=30)
    return [x for x in out.stdout.splitlines() if x]


@on_linux_cluster
def test_gh_flags_only_when_gh_is_signed_in(home, tmp_path):
    assert _flags(home) == []  # no gh: git as before
    gh = _bin(tmp_path / "bin/gh", FAKE_GH)
    assert _flags(home) == []  # gh, not signed in: git as before
    (home / "gh-signed-in").write_text("")
    assert _flags(home) == ["-c", "credential.https://github.com.helper=",
                            "-c", f'credential.https://github.com.helper=!"{gh}" auth git-credential']
    gh.unlink()
    local = _bin(home / ".local/bin/gh", FAKE_GH)  # not on PATH (HPC Hub's shells skip ~/.bashrc): found anyway
    assert _flags(home)[-1] == f'credential.https://github.com.helper=!"{local}" auth git-credential'


def test_net_runs_the_flags_then_git():
    line = github.net("/home/jdoe/my paper", "fetch -q origin")
    assert line.startswith(github.SETUP)
    assert line.endswith(""" git "$@" -C '/home/jdoe/my paper' fetch -q origin""")
    assert "GIT_TERMINAL_PROMPT=0" in line and ".gitconfig" not in line and "git-credentials" not in line


@on_linux_cluster
def test_gh_answers_for_github_com_and_your_own_helper_for_other_hosts(home, tmp_path):
    """git credential fill through the flags: an old token in ~/.git-credentials stays unused for github.com, and
    another host still gets its sign-in from your store helper."""
    (home / ".git-credentials").write_text("https://jdoe:old-token@github.com\nhttps://jdoe:own-secret@example.org\n")
    (home / ".gitconfig").write_text("[credential]\n\thelper = store\n")
    _bin(tmp_path / "bin/gh", FAKE_GH)
    (home / "gh-signed-in").write_text("")

    def fill(host):
        return subprocess.run(["bash", "--norc", "--noprofile", "-c", github.SETUP + 'git "$@" credential fill'],
                              input=f"protocol=https\nhost={host}\n\n", capture_output=True, text=True, timeout=30)

    assert "password=from-gh" in fill("github.com").stdout
    assert "password=own-secret" in fill("example.org").stdout
    (home / "gh-signed-in").unlink()  # gh signed out: your own helper, as before
    assert "password=old-token" in fill("github.com").stdout
    assert (home / ".git-credentials").read_text().count("\n") == 2 and "gh" not in (home / ".gitconfig").read_text()


@on_linux_cluster
def test_a_real_fetch_through_the_helper(home, tmp_path):
    def git(*args, cwd=tmp_path):
        env = {**os.environ, "GIT_AUTHOR_NAME": "jdoe", "GIT_AUTHOR_EMAIL": "jdoe@example.edu",
               "GIT_COMMITTER_NAME": "jdoe", "GIT_COMMITTER_EMAIL": "jdoe@example.edu"}
        return subprocess.run(["git", *args], cwd=cwd, env=env, check=True, capture_output=True, text=True).stdout

    _bin(tmp_path / "bin/gh", FAKE_GH)
    (home / "gh-signed-in").write_text("")
    git("init", "-q", "--bare", "-b", "main", "origin.git")
    git("clone", "-q", "origin.git", "paper")
    git("clone", "-q", "origin.git", "co")
    (tmp_path / "co/main.tex").write_text("\\documentclass{article}\n")
    git("add", "-A", cwd=tmp_path / "co")
    git("commit", "-qm", "First draft", cwd=tmp_path / "co")
    git("push", "-q", "origin", "HEAD:main", cwd=tmp_path / "co")
    res = LocalShell().run(github.net(str(tmp_path / "paper"), "fetch -q origin"))
    assert res.returncode == 0, res.stderr
    assert git("log", "-1", "--format=%s", "origin/main", cwd=tmp_path / "paper").strip() == "First draft"


GITHUB_SAID = {
    "403": "remote: Write access to repository not granted.\nfatal: unable to access "
           "'https://github.com/example/paper.git/': The requested URL returned error: 403",
    "401": "fatal: unable to access 'https://github.com/example/paper.git/': The requested URL returned error: 401",
    "failed": "remote: Invalid username or token. Password authentication is not supported for Git operations.\n"
              "fatal: Authentication failed for 'https://github.com/example/paper.git/'",
    "no prompt": "fatal: could not read Username for 'https://github.com': terminal prompts disabled",
    "not found": "remote: Repository not found.\nfatal: repository 'https://github.com/example/paper.git/' not found",
    "denied": "remote: Permission to example/paper.git denied to octocat-example.\nfatal: unable to access "
              "'https://github.com/example/paper.git/': The requested URL returned error: 403",
}


@pytest.mark.parametrize("name", GITHUB_SAID)
def test_github_turning_the_sign_in_down_is_an_auth_error(name):
    assert github.auth_failed(GITHUB_SAID[name])
    assert github.repo_of(GITHUB_SAID[name]) == ("" if name == "no prompt" else "example/paper")


@pytest.mark.parametrize("text", [
    "fatal: unable to access 'https://github.com/example/paper.git/': Could not resolve host: github.com",
    "ssh: connect to host github.com port 22: Connection timed out",
    "! [rejected]        main -> main (fetch first)",
    "fatal: 'origin' does not appear to be a git repository", "",
])
def test_other_git_errors_are_not(text):
    assert not github.auth_failed(text)


def test_repo_of_takes_https_github_only_and_drops_a_token():
    assert github.repo_of("https://github.com/example/paper.git") == "example/paper"
    assert github.repo_of("https://jdoe:ghp_x@github.com/example/paper") == "example/paper"
    assert github.repo_of("git@github.com:example/paper.git") == ""  # ssh: your keys, not gh
    assert github.repo_of("https://gitlab.example.edu/example/paper.git") == ""


def _repo(tmp_path, url):
    r = tmp_path / "paper"
    subprocess.run(["git", "init", "-q", "-b", "main", str(r)], check=True)
    subprocess.run(["git", "-C", str(r), "remote", "add", "origin", url], check=True)
    return r


@on_linux_cluster
def test_explain_says_which_of_the_three_it_is(home, tmp_path):
    r, sh, err = _repo(tmp_path, "https://jdoe:ghp_not_real@github.com/example/paper.git"), LocalShell(), \
        GITHUB_SAID["403"]
    e = github.explain(sh, str(r), "origin", err, "Could not reach origin: ")
    assert e.kind == "github-auth" and e.details == {"gh": "missing", "account": "", "repo": "example/paper"}
    assert str(e).startswith("Could not reach origin: GitHub turned down") and "install" in str(e)
    _bin(tmp_path / "bin/gh", FAKE_GH)
    e = github.explain(sh, str(r), "", err)
    assert e.details["gh"] == "signed-out" and "not signed in" in str(e)
    (home / "gh-signed-in").write_text("")
    e = github.explain(sh, str(r), "origin", err)
    assert e.details == {"gh": "no-access", "account": "octocat-example", "repo": "example/paper"}
    assert "signed in to GitHub as octocat-example" in str(e) and "Write access to repository not granted" in str(e)
    assert "ghp_" not in str(e) and "gho_" not in str(e)  # no token, ever
    assert "\n" not in str(e)  # the app shows the last line
    assert github.explain(sh, str(r), "origin", "fatal: Could not resolve host: github.com") is None


@on_linux_cluster
def test_an_ssh_remote_keeps_gits_own_words(home, tmp_path):
    r = _repo(tmp_path, "git@github.com:example/paper.git")
    assert github.explain(LocalShell(), str(r), "origin", "ERROR: Repository not found.") is None


@on_linux_cluster
def test_get_the_latest_turned_down_by_github_says_what_to_do(home, tmp_path):
    """The whole safe pull, with a git that GitHub turns down at the fetch: a github-auth error, everything back."""
    real = shutil.which("git")
    (tmp_path / "said").write_text(GITHUB_SAID["403"] + "\n")
    _bin(tmp_path / "bin/git", f"""#!/bin/sh
for a in "$@"; do if [ "$a" = fetch ]; then cat '{tmp_path}/said' >&2; exit 128; fi; done
exec '{real}' "$@"
""")
    _bin(tmp_path / "bin/gh", FAKE_GH)
    (home / "gh-signed-in").write_text("")
    r = _repo(tmp_path, "https://github.com/example/paper.git")
    (r / "main.tex").write_text("x\n")
    subprocess.run([real, "-C", str(r), "add", "-A"], check=True)
    subprocess.run([real, "-C", str(r), "-c", "user.name=jdoe", "-c", "user.email=jdoe@example.edu", "commit", "-qm",
                    "First"], check=True)
    with pytest.raises(github.GitHubAuth) as got:
        sync.start(LocalShell(), str(r), False, lambda s: None)
    assert isinstance(got.value, GitError) and got.value.kind == "github-auth"
    assert got.value.details["gh"] == "no-access" and str(got.value).startswith("Could not reach origin: gh is")
    assert sync.load(LocalShell(), str(r)) is None  # stopped: nothing left half done
