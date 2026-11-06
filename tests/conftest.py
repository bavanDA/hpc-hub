"""Shared fixtures, and the tests some systems skip:

- posix: the stand-in cluster is the local bash, coreutils, tmux, fake ssh scripts, Unix sockets or symlinks, so
  Windows skips them.
- GNU_TOOLS: they need GNU find, stat, du or date, so macOS skips them.
"""

import os
import sys
from pathlib import Path

import pytest

HERE = Path(__file__).parent
WINDOWS = sys.platform == "win32"
MACOS = sys.platform == "darwin"
POSIX = {
    "agents/test_ask_all.py", "agents/test_chat_copy.py", "agents/test_chats.py", "agents/test_lock.py",
    "agents/test_permissions.py", "agents/test_schedules.py", "agents/test_skills.py",
    "api/test_cluster_settings.py", "api/test_files.py", "api/test_files_local.py", "api/test_latex_api.py",
    "api/test_permissions_api.py", "api/test_projects.py", "api/test_schedules_api.py", "api/test_skills_api.py",
    "api/test_backup.py", "backup/test_flow.py",
    "connect/test_vpn_helper.py", "connect/test_vpn_android.py",
    "compute/test_slurm.py", "connect/test_askpass.py", "connect/test_session.py",
    "connect/test_session_asyncssh.py", "core/test_paths.py", "core/test_remote.py",
    "files/test_remote_fs.py", "files/test_transfer.py", "latex/test_latex_git.py",
    "projects/test_projects.py", "terminals/test_tmux.py",
}
# single posix tests in files that otherwise run on Windows
POSIX_TESTS = {
    "agents/test_agents.py::test_claude_start_reads_its_program_first",  # runs bash
    *(f"compute/test_usage_{m}.py::test_script_is_valid_bash" for m in ("accounts", "load", "people", "storage")),
    "compute/test_usage_weekly.py::test_weekly_script_is_valid_bash",
    "compute/test_usage_weekly.py::test_only_billed_partitions_count_where_the_cluster_says_so",
    "core/test_ssh_keys.py::test_saved_key_matches_its_public_line",  # 0600 mode: the key is saved on the phone
    "core/test_ssh_keys.py::test_authorize_replaces_the_last_phone_key",  # sh: it runs on the cluster
    "core/test_vault_file.py::test_saved_encrypted_and_private",  # 0600 mode: the vault is Android only
    "backup/test_units.py::test_summary_reads_odd_names_and_never_opens_files",  # Linux file name bytes
}

GNU_TOOLS = {
    "agents/test_schedules.py::test_next_run_picks_the_next_matching_day",
    "api/test_files.py::test_list_sorts_folders_first_and_gives_the_path",
    "api/test_files.py::test_list_home_and_not_connected",
    "api/test_files.py::test_zip_extract_and_copy_plan",
    "api/test_files_local.py::test_download_never_overwrites",
    "api/test_latex_api.py::test_open_a_tex_file_remembers_the_project_and_lists_the_tree",
    "api/test_latex_api.py::test_picker_shows_latex_projects_and_saved_papers",
    "api/test_latex_api.py::test_pdf_info_and_chunks",
    "api/test_latex_api.py::test_synctex_both_ways",
    "api/test_projects.py::test_browse_lists_folders_only",
    "api/test_projects.py::test_copy_plan_sizes_and_chats",
    "connect/test_session_asyncssh.py::test_duo_login_node_and_disconnect",
    "core/test_ssh_async.py::test_commands",
    "core/test_ssh_async.py::test_stopping_the_local_process_closes_the_channel",
    "files/test_remote_fs.py::test_roundtrip_on_local_shell",
    "files/test_remote_fs.py::test_list_dir_follows_link",
    "files/test_remote_fs.py::test_places",
    "files/test_transfer.py::test_copy_folder_between_shells",
    "files/test_transfer.py::test_copy_leaves_out_skipped_subfolders",
    # the backup's scan is GNU find -printf, its jobs use readlink -f and GNU df
    *(f"backup/test_flow.py::{t}" for t in (
        "test_scan_plan_try_copy_check", "test_copy_needs_the_trial_run_of_the_same_plan",
        "test_refuses_without_space", "test_destination_must_be_from_scratch_outside_scratch",
        "test_newer_files_in_project_win_and_replaced_ones_are_kept", "test_a_killed_copy_starts_again_where_it_was",
        "test_the_weekly_check_scans_like_a_scan_by_hand", "test_a_copy_out_of_time_goes_on_in_a_new_job")),
    *(f"api/test_backup.py::{t}" for t in (
        "test_scan_plan_try_and_copy", "test_your_choices_are_kept_for_later_scans",
        "test_reminders_are_a_scheduled_job", "test_cancel_and_not_connected")),
}


def _name(path: Path) -> str:
    return path.relative_to(HERE).as_posix() if path.is_relative_to(HERE) else ""


def pytest_configure(config):
    if MACOS and not config.option.basetemp:  # Unix socket paths may not pass 104 characters
        config.option.basetemp = f"/tmp/hpc-hub-tests-{os.getuid()}"
    config.addinivalue_line("markers", "posix: needs a POSIX system (bash, coreutils, Unix sockets)")
    config.addinivalue_line("markers", "keyring_backends: may call credentials' real backend functions "
                                       "(the test stands in for the vault modules itself)")


def pytest_report_header(config):
    lines = []
    if WINDOWS:
        lines.append(f"posix: skipped on Windows: {len(POSIX)} files, {len(POSIX_TESTS)} tests "
                     "(see tests/conftest.py)")
    if MACOS:
        lines.append(f"gnu: skipped on macOS: {len(GNU_TOOLS)} tests (see tests/conftest.py)")
    return lines


def pytest_collection_modifyitems(config, items):
    for item in items:
        name = _name(Path(str(item.fspath)))
        test = f"{name}::{getattr(item, 'originalname', item.name)}"
        if name in POSIX or test in POSIX_TESTS:
            item.add_marker(pytest.mark.posix)
            if WINDOWS:
                item.add_marker(pytest.mark.skip(reason="posix: the stand-in cluster is the local bash and "
                                                        "Unix tools; runs on Linux"))
        if MACOS and test in GNU_TOOLS:
            item.add_marker(pytest.mark.skip(reason="gnu: the stand-in cluster needs GNU find, stat, du or date; "
                                                    "runs on Linux"))


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


@pytest.fixture(autouse=True)
def _own_cache_folder(tmp_path_factory, monkeypatch):
    """Logs and the chat lists the app keeps go to a temporary folder, never the user's ~/.cache."""
    monkeypatch.setenv("XDG_CACHE_HOME", str(tmp_path_factory.mktemp("cache")))


@pytest.fixture(autouse=True)
def _never_the_real_keyring(request, monkeypatch):
    """Every test gets an in-memory keyring, so none can read, change or delete the logins of whoever runs the
    tests (a missed monkeypatch once called the real one). Tests marked keyring_backends stub the vaults
    themselves."""
    if request.node.get_closest_marker("keyring_backends"):
        yield
        return
    from hpc_hub.core import credentials
    store: dict = {}
    key = lambda attrs: tuple(sorted(attrs.items()))  # noqa: E731
    monkeypatch.setattr(credentials, "_store", lambda attrs, label, secret: store.__setitem__(key(attrs), secret))
    monkeypatch.setattr(credentials, "_lookup", lambda attrs: store.get(key(attrs)))
    monkeypatch.setattr(credentials, "_clear", lambda attrs: store.pop(key(attrs), None))
    yield
