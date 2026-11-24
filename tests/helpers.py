"""Shared test helpers."""

import os
import sys

import pytest

# The clusters run Linux: tests that use the local bash as one skip on Windows
on_linux_cluster = pytest.mark.skipif(sys.platform == "win32", reason="the local bash stands in for the cluster")

# macOS: Homebrew's GNU tools under their own names, which the stand-in cluster needs as a Linux cluster has them
# (tests/conftest.py GNU_TOOLS). A test that sets its own PATH keeps these in it.
GNU_PATH = [d for prefix in ("/opt/homebrew", "/usr/local") for d in (
    f"{prefix}/opt/coreutils/libexec/gnubin", f"{prefix}/opt/findutils/libexec/gnubin",
    f"{prefix}/opt/gnu-sed/libexec/gnubin", f"{prefix}/opt/grep/libexec/gnubin",
    f"{prefix}/opt/gnu-tar/libexec/gnubin", f"{prefix}/opt/util-linux/bin", f"{prefix}/opt/rsync/bin")
    if os.path.isdir(d)] if sys.platform == "darwin" else []


class LocalShell:
    """Stands in for SshMaster: runs the 'remote' commands locally."""

    def argv(self, command, tty=False):
        if sys.platform == "win32":
            pytest.skip("the local bash stands in for the cluster")
        return ["bash", "-c", command]
    node_argv = argv

    def run(self, command, timeout=60, fast=None):
        import subprocess
        return subprocess.run(self.argv(command), capture_output=True, text=True, timeout=timeout)
    on_login = run
    read = run

    def popen(self, command, **kwargs):
        import subprocess
        return subprocess.Popen(self.argv(command), stdin=subprocess.DEVNULL, text=True, **kwargs)

    def copy_argv(self, src, dst):
        return ["cp", "-r", src.lstrip(":"), dst.lstrip(":")]
