"""Shared fixtures, and what Windows (CI's windows-latest) leaves out, each with its reason in the report:

- gtk: needs PyGObject, which Windows has not: the GTK app's screens, Poppler, the GTK sign-in window, and
  Chrome's cookie key from the GNOME keyring (chrome_cookies, so also ood and keysetup). Whole files that import gi
  are not collected; single tests are skipped.
- posix: tests whose fake cluster is the local bash, coreutils, tmux, fake ssh scripts, Unix sockets or
  symlinks. What they check runs on the Linux cluster, and the Linux job runs them.
"""

import importlib.util
import sys
from pathlib import Path

import pytest

HERE = Path(__file__).parent
WINDOWS = sys.platform == "win32"
HAVE_GTK = importlib.util.find_spec("gi") is not None

GTK_FILES = {"files/test_file_menu.py", "latex/test_file_tree.py", "api/test_keysetup.py",
             "connect/test_chrome_cookies.py", "connect/test_ood.py"}
GTK_TESTS = {
    "api/test_sso.py::test_chrome_profile_picks_up_the_token",
    "api/test_sso.py::test_chrome_profile_can_switch_to_the_app_window_or_cancel",
    "api/test_sso.py::test_sign_in_window_uses_the_same_fill_script",
    "connect/test_vpn_sso.py::test_password_only_goes_to_the_sign_in_site",
    "pdf/test_readaloud.py::test_assemble_parts_and_offsets",
}
POSIX = {
    "agents/test_ask_all.py", "agents/test_chat_copy.py", "agents/test_chats.py", "agents/test_lock.py",
    "agents/test_permissions.py", "agents/test_schedules.py", "agents/test_skills.py",
    "api/test_cluster_settings.py", "api/test_files.py", "api/test_files_local.py", "api/test_latex_api.py",
    "api/test_permissions_api.py", "api/test_projects.py", "api/test_schedules_api.py", "api/test_skills_api.py",
    "compute/test_slurm.py", "compute/test_usage.py", "connect/test_askpass.py", "connect/test_session.py",
    "connect/test_session_asyncssh.py", "core/test_paths.py", "core/test_remote.py",
    "files/test_remote_fs.py", "files/test_transfer.py", "latex/test_latex_git.py",
    "projects/test_projects.py", "terminals/test_tmux.py",
}


def _name(path: Path) -> str:
    return path.relative_to(HERE).as_posix() if path.is_relative_to(HERE) else ""


def pytest_configure(config):
    config.addinivalue_line("markers", "gtk: needs PyGObject (GTK screens, Poppler, GNOME keyring)")
    config.addinivalue_line("markers", "posix: needs a POSIX system (bash, coreutils, Unix sockets)")


def pytest_ignore_collect(collection_path, config):
    if not HAVE_GTK and _name(Path(collection_path)) in GTK_FILES:
        return True
    return None


def pytest_report_header(config):
    lines = []
    if not HAVE_GTK:
        lines.append(f"gtk: no PyGObject, not collected: {', '.join(sorted(GTK_FILES))}")
    if WINDOWS:
        lines.append(f"posix: skipped on Windows: {len(POSIX)} files (see tests/conftest.py)")
    return lines


def pytest_collection_modifyitems(config, items):
    for item in items:
        name = _name(Path(str(item.fspath)))
        test = f"{name}::{getattr(item, 'originalname', item.name)}"
        if name in GTK_FILES or test in GTK_TESTS:
            item.add_marker(pytest.mark.gtk)
            if not HAVE_GTK:
                item.add_marker(pytest.mark.skip(reason="gtk: needs PyGObject"))
        if name in POSIX:
            item.add_marker(pytest.mark.posix)
            if WINDOWS:
                item.add_marker(pytest.mark.skip(reason="posix: the stand-in cluster is the local bash and "
                                                        "Unix tools; runs on Linux"))


@pytest.fixture
def sshd(tmp_path, monkeypatch):
    """An SSH server in this process (tests/fake_sshd.py) whose files are tmp_path/remote; asyncssh logins see
    only it: no keys, agent, config or known_hosts of yours."""
    pytest.importorskip("asyncssh")
    from tests import fake_sshd
    if not fake_sshd.BASH:
        pytest.skip("no bash to stand in for the cluster's shell")
    from hpc_hub.core import ssh_async

    monkeypatch.setenv("HPC_HUB_SSH", "asyncssh")  # a session here must never start OpenSSH against it
    monkeypatch.setattr(ssh_async, "KNOWN_HOSTS", tmp_path / "ssh" / "known_hosts")
    monkeypatch.setattr(ssh_async, "OPTIONS", {"client_keys": None, "agent_path": None, "config": []})
    server = fake_sshd.FakeSshd(tmp_path / "remote")
    server.start()
    yield server
    server.stop()
