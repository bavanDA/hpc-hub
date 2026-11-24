"""Shared fixtures, and the tests some systems skip:

- posix: the stand-in cluster is the local bash, coreutils, tmux, fake ssh scripts, Unix sockets or symlinks, so
  Windows skips them.
- GNU_TOOLS: the stand-in cluster needs GNU tools (find -printf, stat -c, readlink -m, chmod --reference, timeout,
  setsid, ...), as every Linux cluster has. On macOS they run with Homebrew's GNU tools first in PATH (brew install
  coreutils findutils gnu-sed grep gnu-tar util-linux), and are skipped without them.
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
    "api/test_backup.py", "backup/test_flow.py", "api/test_latex_assist_api.py", "connect/test_vpn_stale.py",
    "connect/test_vpn_helper.py", "connect/test_vpn_android.py",
    "compute/test_slurm.py", "connect/test_askpass.py", "connect/test_session.py",
    "connect/test_session_asyncssh.py", "core/test_paths.py", "core/test_remote.py",
    "files/test_remote_fs.py", "files/test_transfer.py", "latex/test_latex_git.py",
    "projects/test_projects.py", "terminals/test_tmux.py", "terminals/test_history.py",
}
# single posix tests in files that otherwise run on Windows
POSIX_TESTS = {
    "agents/test_agents.py::test_claude_start_reads_its_program_first",  # runs bash
    "terminals/test_pages.py::test_a_relative_page_not_in_the_session_folder_is_found_below_it",  # runs bash
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
    "agents/test_chat_copy.py::test_copy_files_the_chat_under_the_real_folder",  # readlink -m
    "api/test_files.py::test_real_path_follows_links",
    # saving a file: readlink -f, chmod --reference
    "api/test_latex_api.py::test_files_read_write_and_manage_inside_the_project_only",
    "api/test_latex_history_api.py::test_a_save_keeps_a_version",
    *(f"api/test_latex_assist_api.py::{t}" for t in (
        "test_write_message_in_the_background", "test_ask_about_a_commit_with_a_one_time_choice",
        "test_a_one_time_choice_keeps_your_agent", "test_ask_about_lines", "test_cancel",
        "test_notes_and_check_my_list", "test_notes_write_only_over_what_was_read", "test_bad_places_and_text")),
    *(f"api/test_projects.py::{t}" for t in (
        "test_status_reads_git_of_every_project_at_once", "test_projects_are_shared_through_the_cluster",
        "test_copy_into_another_group_on_the_same_cluster")),
    "api/test_terminals.py::test_a_pasted_image_lands_in_a_private_folder_and_gives_its_path",
    "api/test_terminals.py::test_old_pastes_are_cleaned_up",
    "backup/test_flow.py::test_a_scan_runs_on_the_node_without_a_new_job",  # setsid
    # the fast shell's results are sized with stat -c%s (asyncssh's shells reuse its protocol)
    *(f"core/test_fastshell_parallel.py::{t}" for t in (
        "test_a_command_gives_output_errors_and_code", "test_commands_really_run_at_the_same_time",
        "test_big_outputs_at_once_stay_whole", "test_a_shell_can_be_given_more_room",
        "test_a_slow_command_does_not_hold_up_the_others", "test_a_timeout_stops_only_that_command",
        "test_the_lock_is_free_after_a_timeout")),
    *(f"core/test_ssh_async.py::{t}" for t in (
        "test_a_tunnel_port_keeps_the_cluster_name_for_the_host_key", "test_commands_run_at_the_same_time",
        "test_big_outputs_at_once_stay_whole", "test_a_timeout_stops_only_that_command")),
    "files/test_transfer.py::test_copy_here_into_another_folder_and_again",
    "connect/test_vpn_android.py::test_session_on_the_phone_connects_ssh_through_the_tunnel",
    "globus/test_personal.py::test_personal_start_again_with_new_folders",  # readlink -f, setsid
    *(f"latex/test_assist.py::{t}" for t in (  # timeout
        "test_run_script_answers_after_the_mark_and_cleans_up", "test_run_script_falls_back_for_an_older_agent",
        "test_run_script_failure_and_cancel")),
    *(f"latex/test_history.py::{t}" for t in (  # head -z, chmod --reference
        "test_changes_now_include_new_files_but_not_build_files", "test_saved_versions_leave_index_and_files_alone",
        "test_changes_to_the_same_file_can_still_come_along", "test_safe_push_pulls_first_and_brings_changes_back",
        "test_a_spot_to_settle_stops_before_the_push", "test_stop_puts_everything_back")),
    *(f"terminals/test_pages.py::{t}" for t in (  # realpath -e
        "test_fetch", "test_fetch_follows_links", "test_same_folder_names_kept_apart",
        "test_a_relative_page_not_in_the_session_folder_is_found_below_it")),
}
# Homebrew's GNU tools under their own names (macOS)
GNU_PATH = [d for prefix in ("/opt/homebrew", "/usr/local") for d in (
    f"{prefix}/opt/coreutils/libexec/gnubin", f"{prefix}/opt/findutils/libexec/gnubin",
    f"{prefix}/opt/gnu-sed/libexec/gnubin", f"{prefix}/opt/grep/libexec/gnubin",
    f"{prefix}/opt/gnu-tar/libexec/gnubin", f"{prefix}/opt/util-linux/bin") if os.path.isdir(d)] if MACOS else []


def _name(path: Path) -> str:
    return path.relative_to(HERE).as_posix() if path.is_relative_to(HERE) else ""


def pytest_configure(config):
    if MACOS and not config.option.basetemp:  # Unix socket paths may not pass 104 characters
        config.option.basetemp = f"/tmp/hpc-hub-tests-{os.getuid()}"
    config.addinivalue_line("markers", "posix: needs a POSIX system (bash, coreutils, Unix sockets)")
    config.addinivalue_line("markers", "gnu: the stand-in cluster needs GNU tools (macOS: Homebrew's, first in PATH)")
    config.addinivalue_line("markers", "keyring_backends: may call credentials' real backend functions "
                                       "(the test stands in for the vault modules itself)")


def pytest_report_header(config):
    lines = []
    if WINDOWS:
        lines.append(f"posix: skipped on Windows: {len(POSIX)} files, {len(POSIX_TESTS)} tests "
                     "(see tests/conftest.py)")
    if MACOS:
        lines.append(f"gnu: {len(GNU_TOOLS)} tests run with " + (", ".join(GNU_PATH) if GNU_PATH else
                     "no GNU tools found: skipped") + " (see tests/conftest.py)")
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
            item.add_marker(pytest.mark.gnu)
            if not GNU_PATH:
                item.add_marker(pytest.mark.skip(reason="gnu: the stand-in cluster needs GNU tools (brew install "
                                                        "coreutils findutils gnu-sed grep gnu-tar util-linux)"))


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
def _gnu_tools_for_the_stand_in_cluster(request, monkeypatch):
    """macOS: a test whose stand-in cluster needs GNU tools gets Homebrew's first in PATH, as a cluster has them.
    The other tests keep macOS's own, so the app's code that runs on the Mac is tested with what a Mac has."""
    if GNU_PATH and request.node.get_closest_marker("gnu"):
        monkeypatch.setenv("PATH", os.pathsep.join([*GNU_PATH, os.environ.get("PATH", "")]))


@pytest.fixture(autouse=True)
def _own_cache_folder(tmp_path_factory, monkeypatch):
    """Logs and the chat lists the app keeps go to a temporary folder, never the user's ~/.cache."""
    monkeypatch.setenv("XDG_CACHE_HOME", str(tmp_path_factory.mktemp("cache")))


@pytest.fixture(autouse=True)
def _never_the_real_keyring(request, monkeypatch):
    """Every test gets an in-memory keyring, so none can read, change or delete the logins of whoever runs the
    tests (a missed monkeypatch once called the real one). Tests marked keyring_backends stub the vaults
    themselves. Either way the logins kept in memory start empty."""
    from hpc_hub.core import credentials
    monkeypatch.setattr(credentials, "_cache", {})
    if request.node.get_closest_marker("keyring_backends"):
        yield
        return
    store: dict = {}
    key = lambda attrs: tuple(sorted(attrs.items()))  # noqa: E731
    monkeypatch.setattr(credentials, "_store", lambda attrs, label, secret: store.__setitem__(key(attrs), secret))
    monkeypatch.setattr(credentials, "_lookup", lambda attrs: store.get(key(attrs)))
    monkeypatch.setattr(credentials, "_clear", lambda attrs: store.pop(key(attrs), None))
    yield
