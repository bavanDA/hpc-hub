"""Sign in to GitHub with gh, in a terminal on the login node, so you see its one-time code. When gh isn't on the
cluster, its official release goes into ~/.local/bin first (no root)."""

import shlex
import time

from ....latex.github import FIND_GH
from ....terminals import tmux
from ...hub import hub
from ...server import method
from ..tools import PATH_LINE

GH_VERSION = "2.105.0"  # when GitHub's API doesn't answer with the latest release
RELEASES = "https://github.com/cli/cli/releases"  # gh's official builds, with their checksums
LOGIN = "auth login --hostname github.com --git-protocol https --web"


def _say(*lines: str) -> str:
    return "; ".join(f"echo {shlex.quote(x)}" if x else "echo" for x in lines)


def install_gh() -> str:
    """Shell that puts gh's official release for this machine into ~/.local/bin, checked against its checksum.
    Succeeds when it is there; says the version in $v."""
    latest = ("v=$(curl -fsSL https://api.github.com/repos/cli/cli/releases/latest 2>/dev/null | "
              "sed -n 's/.*\"tag_name\": *\"v\\([0-9][0-9.]*\\)\".*/\\1/p' | head -n 1)")
    return " ".join([
        f"{latest}; v=${{v:-{GH_VERSION}}};",
        'case "$(uname -m)" in x86_64|amd64) a=amd64;; aarch64|arm64) a=arm64;; *) a=;; esac;',
        f'f="gh_${{v}}_linux_$a"; u="{RELEASES}/download/v$v";',
        'if [ -z "$a" ]; then echo "gh has no build for $(uname -m) here."; false; else',
        'echo "  $u/$f.tar.gz"; t=$(mktemp -d) &&',
        'curl -fsSL -o "$t/$f.tar.gz" "$u/$f.tar.gz" && curl -fsSL -o "$t/sums" "$u/gh_${v}_checksums.txt" &&',
        '( cd "$t" && grep " $f.tar.gz$" sums | sha256sum -c --quiet - ) && tar -xzf "$t/$f.tar.gz" -C "$t" &&',
        'mkdir -p "$HOME/.local/bin" && cp "$t/$f/bin/gh" "$HOME/.local/bin/gh" && chmod 755 "$HOME/.local/bin/gh";',
        'ok=$?; rm -rf "$t"; [ "$ok" = 0 ]; fi',
    ])


def sign_in_script() -> str:
    """What the terminal runs: gh installed if it isn't there, then gh's sign-in in the browser, then what to do
    next. Never writes ~/.gitconfig itself; ends in a shell, so the terminal stays open to read."""
    path = (f"if ! bash -ic 'type -t gh' >/dev/null 2>&1 </dev/null; then "
            f"printf '\\n%s\\n' {shlex.quote(PATH_LINE)} >> ~/.bashrc && "
            "echo 'Added ~/.local/bin to your PATH in ~/.bashrc.'; fi")
    install = ('if [ -z "$hpchub_gh" ]; then '
               + _say("gh, GitHub's own command line tool, is not on this cluster yet.",
                      "Installing its official release in your home folder (~/.local/bin), no root needed:") + "; "
               f'if {install_gh()}; then hpchub_gh="$HOME/.local/bin/gh"; echo "gh $v is installed."; {path}; '
               f"else echo; {_say('gh did not install. The lines above say why.')}; fi; fi")
    login = ('if [ -n "$hpchub_gh" ]; then echo; '
             + _say("Signing in to GitHub with gh. It shows a one-time code: open https://github.com/login/device",
                    "in your browser, type the code there and approve. (If gh asks you to press Enter to open a",
                    "browser, press it: there is no browser here, so it shows the address instead.)", "",
                    'If gh asks "Authenticate Git with your GitHub credentials?": Yes also makes the git you run',
                    "yourself use gh (it changes ~/.gitconfig). HPC Hub uses gh for github.com either way.", "") + "; "
             f'if "$hpchub_gh" {LOGIN}; then echo; '
             + _say("Signed in. Go back to the paper in HPC Hub and press Try again.", "",
                    "Optional: to make the git you run yourself in a terminal use gh too, run:",
                    "  gh auth setup-git") + "; "
             f"else echo; {_say('The sign-in did not finish. Run this again from HPC Hub, or here:')}; "
             f"echo {shlex.quote('  gh ' + LOGIN)}; fi; fi")
    return "; ".join(["set -o pipefail", FIND_GH.rstrip("; "), install, login, "exec bash -l"])


@method("latex.gh_sign_in")
def gh_sign_in(cluster: str) -> dict:
    """A terminal on the login node that signs in to GitHub with gh (installing it first when it isn't there), for
    the Papers' pull and push to github.com. The app's git then uses gh, and nothing else changes."""
    s = hub().connected(cluster)
    name, title = f"hpchub-gh-{time.strftime('%H%M%S')}", "Sign in to GitHub"
    line = tmux.open_line(name, f"bash -c {shlex.quote(sign_in_script())}", title)
    return {"argv": s.ssh.argv(line, tty=True), "name": name, "node": "", "title": title, "color": ""}
