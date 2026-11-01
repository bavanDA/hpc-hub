"""Plain card messages for failed connects."""

from hpc_hub.connect import messages
from hpc_hub.core import config

WULVER, YALE, SDSC = (next(c for c in config.default_clusters() if c.id == i) for i in ("wulver", "yale", "sdsc"))


def test_duo_timeout_says_what_to_do():
    assert messages.plain("SSH login timed out", WULVER).startswith("Duo wasn't approved in time")
    assert messages.plain("SSH login timed out", SDSC) == "The sign-in took too long. Click Try again."


def test_refused_login_names_the_cluster_and_its_label():
    msg = messages.plain("jdoe@wulver.njit.edu: Permission denied (keyboard-interactive).", WULVER)
    assert msg == "Wulver (NJIT) didn't accept your UCID or password. Check them in Settings, then try again."
    assert "code" in messages.plain("Permission denied", SDSC)
    assert messages.plain("Permission denied (publickey)", YALE) == "Permission denied (publickey)"  # key flow says


def test_unreachable_and_unknown():
    assert messages.plain("ssh: connect to host x port 22: Connection timed out", WULVER).endswith("Is the VPN on?")
    assert messages.plain("something new", WULVER) == "something new"
