"""Every sentence the login screens say about passwords and SSH keys, in one place so the wording can change in
one go. The desktop app keeps its own copy in app/src/components/clusters/loginCopy.ts; keep the two alike.
The full cluster name is said once, in the title; after that the org ("Yale", who) or nothing."""

# connecting before there is a login
FIRST_PASSWORD = "Enter your username and password first"
FIRST_KEY = "Set up your SSH key and username first"

SIGN_IN = "Sign in to {name}"

# the second step, decided by the cluster's admins (ClusterConfig.second_step)
SECOND_DUO = "This cluster asks for Duo on your phone."
SECOND_CODE = "This cluster asks for a code from your authenticator app."
USERNAME_HINT = "e.g. ab123"
REMEMBER = "Remember password"

# a cluster that takes only passwords (Wulver)
PASSWORD_HELP = "Your {who} {label} password."
PASSWORD_NOTE = ("This cluster doesn't accept SSH keys, so HPC Hub signs in with your password. It's saved encrypted "
                 "in {store}, the way a browser saves passwords.")
PASSWORD_DUO = "After you sign in, approve the Duo push on your phone."
SAVED_IN = "Saved encrypted in {store}."

# a cluster you log in to with a key you paste on its key page (Yale)
KEY_INTRO = "You need an SSH key to sign in."
WHATS_A_KEY = "What's an SSH key?"
KEY_HELP = "https://docs.github.com/en/authentication/connecting-to-github-with-ssh/about-ssh"  # when none is set
STEP_KEY = "Your SSH key"
NO_KEY = "If you don't have one, HPC Hub can make one."
CREATE_KEY = "Create SSH key"
HAVE_KEY = "This computer has an SSH key ({file})."
STEP_ADD = "Add it to {who}"
COPY_KEY = "Copy public key"
COPIED = "Copied"
PASTE_IT = "Paste it on {who}'s SSH key page."
OPEN_PAGE = "Open {who} SSH key page"
ADDED_IT = "I added it"
ADDED = "Added on {who}'s SSH key page."
STEP_TEST = "Test your login"
KEY_DUO = "You'll also get a Duo push on your phone."
TEST_BUTTON = "Test login"
CHANGE = "Change"
USE_PASSWORD = "Use a password instead"
USE_KEY = "Use an SSH key instead"

# what the login test found (core/my_key.py verdict)
TEST_OK = "Login works."
TEST_UNKNOWN_KEY = "{who} doesn't know this key yet. If you just added it, wait a few minutes and test again."
TEST_UNREACHABLE_VPN = "Can't reach the cluster. Connect to the {vpn} VPN, then test again."
TEST_UNREACHABLE = "Can't reach the cluster. Check your connection, then test again."
TEST_HOST_KEY = "The cluster's server key changed. Ask its admins before you connect."
TEST_UNFINISHED = "The test didn't finish. {last}"
TEST_NO_SSH = "No ssh program here to test with."
TEST_NO_KEY = "Create your SSH key first."
TEST_NO_USER = "Type your username first."
