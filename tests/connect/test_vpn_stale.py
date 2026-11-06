"""A sign-in left by an app that quit holds openconnect's browser port: the next one ends it first."""

import subprocess
import sys
import time

from hpc_hub.connect import vpn


def test_only_our_waiting_sign_ins_are_ended(tmp_path):
    # stand-ins named like the real ones: ours (browser hpc-hub-sso) and someone else's openconnect
    fake = tmp_path / "openconnect"
    fake.write_text(f"#!{sys.executable}\nimport time\ntime.sleep(60)\n")
    fake.chmod(0o755)
    ours = subprocess.Popen([str(fake), "--authenticate", "--external-browser", "/x/bin/hpc-hub-sso", "vpn.edu"])
    other = subprocess.Popen([str(fake), "--authenticate", "vpn.example.edu"])
    time.sleep(0.3)
    try:
        vpn.end_stale_sign_ins()
        assert ours.wait(timeout=5) != 0
        assert other.poll() is None
    finally:
        for p in (ours, other):
            p.kill()
            p.wait()
