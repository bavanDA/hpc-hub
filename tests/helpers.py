"""Shared test helpers."""


class LocalShell:
    """Stands in for SshMaster: runs the 'remote' commands locally."""

    def argv(self, command, tty=False):
        return ["bash", "-c", command]

    def run(self, command, timeout=60, fast=None):
        import subprocess
        return subprocess.run(self.argv(command), capture_output=True, text=True, timeout=timeout)

    def copy_argv(self, src, dst):
        return ["cp", "-r", src.lstrip(":"), dst.lstrip(":")]
