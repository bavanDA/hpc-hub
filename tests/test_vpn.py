import sys
import textwrap

import pytest

from hpc_hub import config, vpn

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
