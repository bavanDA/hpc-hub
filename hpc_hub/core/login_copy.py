"""Every sentence the sign-in screens say, in one place. The desktop app's copy is made from this file:
`python -m hpc_hub.core.login_copy` writes app/src/components/clusters/loginStrings.ts (a test checks it's current).

House rules (tests/core/test_login_copy.py checks them): the full cluster name only in the title, after that the
org ("{who}") or nothing; no "if" (each state says only what is true now); "Sign in", never "Log in"; no dashes.
"""

import json
import sys
from pathlib import Path

# connecting before there is a sign-in
FIRST = "Finish signing in to {short} first."

SIGN_IN = "Sign in to {name}"
USERNAME_HINT = "e.g. ab123"
PASSWORD = "Password"
SAVED = "Saved (type to replace)"  # the password field's placeholder when one is saved
REMEMBER = "Remember password"
REMEMBER_OFF = "You'll type it each time you open HPC Hub."  # under the switch, only while it's off
SAVED_IN = "Saved in {store}."
SKIP = "Do this later"
USED_ON_CONNECT = "HPC Hub uses this when you click Connect."  # first start: saving isn't signing in yet
PASSWORD_NOTE = "Kept in this computer's password store. Changing it here doesn't change your {who} password."
FORGET_TITLE = "Forget the saved {short} password?"
FORGET_BODY = "You'll type it next time you connect. Your {label} stays."
FORGET = "Forget password"
KEEP = "Keep it"
CONTINUE = "Continue"

# the second step, decided by the cluster's admins (ClusterConfig.second_step)
SECOND_DUO = "Uses Duo"
SECOND_CODE = "You'll need a code from your authenticator app."
CODE_SETUP = "Set up your authenticator app"
DUO_NOW = "Check your phone for a Duo push."
DUO_LATE = "No answer from Duo yet. Pushes expire after about a minute."
NEW_PUSH = "Send a new push"

# a cluster with a web portal that adds your key (SDSC)
PORTAL = "Sign in with the {short} portal"
OR_PASSWORD = "Or use your username and password:"
PORTAL_NOTE = "Recommended. No password is stored."

# a cluster you sign in to with a key you paste on its key page (Yale)
KEY_INTRO = "{who} uses an SSH key instead of a password."
WHATS_A_KEY = "What's an SSH key?"
KEY_HELP = "https://docs.github.com/en/authentication/connecting-to-github-with-ssh/about-ssh"  # when none is set
STEP_KEY = "Make a key"
STEP_KEY_DONE = "Key"
CREATE_KEY = "Create key"
USE_MINE = "Use a key I already have"
PICK_KEY = "Pick your private SSH key"  # the file dialog's title
KEY_FOUND = "Found on this computer ({file})"
KEY_MADE = "Made just now ({file})"
KEY_PICKED = "Your key ({file})"
ALREADY_ON = "Already on {who}? Try it"
STEP_ADD = "Send it to {who}"
COPY_KEY = "Copy"
COPIED = "Copied"
PASTE_IT = "Paste it on {who}'s key page."
OPEN_PAGE = "Open key page"
PASTED_IT = "I pasted it"
PASTED = "Pasted"
STEP_TEST = "Try it"
TRY = "Try it"
TRY_AGAIN = "Try again"
CONNECT_VPN = "Connect {who} VPN"
SIGNED_IN_AS = "Signed in as {user}"
CHANGE = "Change"
USE_PASSWORD = "Use a password instead"
USE_KEY = "Use an SSH key instead"

# what the sign-in test found (core/my_key.py verdict), by reason
TEST = {
    "ok": "You're in.",
    "not_yet": "{who} hasn't picked up your key yet. It can take up to 10 minutes.",
    "no_vpn": "{who} is only reachable on the VPN, and you're not on it right now.",
    "unreachable": "Can't get through to {who} from this network.",
    "host_key": "{who}'s server looks different from last time. Check with {who}'s HPC team before you connect.",
    "unfinished": "That didn't finish: {last}",
    "no_ssh": "This computer has no ssh program, so HPC Hub can't test the key.",
}


def strings() -> dict[str, object]:
    """The constants above by name, for the desktop app."""
    return {k: v for k, v in globals().items() if k.isupper() and isinstance(v, (str, dict))}


def typescript() -> str:
    return ("// Made by `python -m hpc_hub.core.login_copy` from hpc_hub/core/login_copy.py. Don't edit by hand.\n"
            f"export const S = {json.dumps(strings(), indent=2, ensure_ascii=False)} as const\n")


TS_FILE = Path(__file__).resolve().parents[2] / "app" / "src" / "components" / "clusters" / "loginStrings.ts"

if __name__ == "__main__":
    TS_FILE.write_text(typescript(), encoding="utf-8")
    sys.stdout.write(f"wrote {TS_FILE}\n")
