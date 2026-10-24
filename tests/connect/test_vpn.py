import sys
import textwrap

import pytest

from hpc_hub.core import config
from hpc_hub.connect import vpn

FAKE_OPENCONNECT = textwrap.dedent("""
    import sys
    def ask(label):
        sys.stderr.write(label); sys.stderr.flush()
        return sys.stdin.readline().strip()
    sys.stderr.write("Please enter your username and password.\\n")
    pw = ask("Password:")
    duo = ask("Second Password:")
    if pw != "pw" or duo != "push":
        sys.stderr.write("Login failed.\\n"); sys.exit(1)
    print("COOKIE='abc=123'")
    print("HOST='1.2.3.4'")
    print("FINGERPRINT='pin-sha256:xyz'")
""")


def fake(tmp_path):
    script = tmp_path / "fake_oc.py"
    script.write_text(FAKE_OPENCONNECT)
    return [sys.executable, str(script)]


def test_interactive_login(tmp_path):
    seen, logs = [], []
    answers = {"Password:": "pw", "Second Password:": "push"}

    def answer(prompt):
        seen.append(prompt)
        return answers[prompt]

    code, out, _ = vpn.run_interactive(fake(tmp_path), answer, logs.append, timeout=10)
    assert code == 0
    assert seen == ["Password:", "Second Password:"]
    auth = vpn.parse_auth_output(out)
    assert auth == {"COOKIE": "abc=123", "HOST": "1.2.3.4", "FINGERPRINT": "pin-sha256:xyz"}
    assert not any("abc=123" in line for line in logs)


def test_cancel_kills(tmp_path):
    with pytest.raises(vpn.VpnError):
        vpn.run_interactive(fake(tmp_path), lambda p: None, lambda l: None, timeout=10)


def test_nm_vpn_data():
    yale = config.default_clusters()[1]
    data = vpn.nm_vpn_data(yale)
    assert "gateway = access.yale.edu" in data
    assert "protocol = anyconnect" in data
    assert "cookie-flags = 2" in data


def test_nm_ip_args_split():
    wulver = config.default_clusters()[0]
    args = dict(zip(vpn.nm_ip_args(wulver)[::2], vpn.nm_ip_args(wulver)[1::2]))
    assert args["ipv4.never-default"] == "yes"
    assert args["ipv4.dns-search"] == "~njit.edu"
    assert args["ipv4.routes"] == "128.235.0.0/16" and args["ipv6.routes"] == ""
    wulver.vpn.split_tunnel = False
    args = dict(zip(vpn.nm_ip_args(wulver)[::2], vpn.nm_ip_args(wulver)[1::2]))
    assert args["ipv4.never-default"] == "no" and args["ipv4.dns-search"] == ""


def test_split_errors():
    yale = config.default_clusters()[1]
    assert vpn.split_errors(yale) == []
    yale.vpn.routes, yale.vpn.domains = "10.0.0.0/8 nope", "yale.edu bad;x"
    assert len(vpn.split_errors(yale)) == 2


def test_nm_secrets_fill_resolve():
    sec = vpn.nm_secrets({"COOKIE": "c", "HOST": "vpn.njit.edu", "FINGERPRINT": "pin-sha256:x"}, "vpn.njit.edu",
                         lookup=lambda h: "128.235.249.36")
    assert sec == {"cookie": "c", "gateway": "vpn.njit.edu", "gwcert": "pin-sha256:x",
                   "resolve": "vpn.njit.edu:128.235.249.36"}
    sec = vpn.nm_secrets({"COOKIE": "c", "RESOLVE": "a:1.2.3.4"}, "a", lookup=lambda h: 1 / 0)
    assert sec["resolve"] == "a:1.2.3.4" and sec["gateway"] == "a"
