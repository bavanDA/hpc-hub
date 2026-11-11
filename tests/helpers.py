"""Shared test helpers."""

import sys

import pytest

# The clusters run Linux: tests that use the local bash as one skip on Windows
on_linux_cluster = pytest.mark.skipif(sys.platform == "win32", reason="the local bash stands in for the cluster")


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
