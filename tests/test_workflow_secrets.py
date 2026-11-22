"""The update key signs what every HPC Hub installs: no step that runs npm packages' code may see it."""

from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
BUILD = (ROOT / ".github" / "workflows" / "build.yml").read_text()


def steps(text: str) -> list[str]:
    return text.split("\n      - ")


def installers_job() -> str:
    return BUILD[BUILD.index("\n  installers:\n"):BUILD.index("\n  release:\n")]


def test_no_secret_is_set_for_the_whole_job():
    job = installers_job()
    head = job[:job.index("steps:")]
    assert "secrets." not in head.replace("secrets.TAURI_SIGNING_PRIVATE_KEY != ''", "").replace(
        "secrets.MACOS_SIGN_P12 != ''", "")


def test_the_key_is_only_in_the_tauri_build_step():
    with_key = [s for s in steps(installers_job()) if "secrets.TAURI_SIGNING_PRIVATE_KEY }}" in s]
    assert len(with_key) == 1 and with_key[0].startswith("run: npm run tauri:release")
    mac = [s for s in steps(installers_job()) if "secrets.MACOS_SIGN_P12 }}" in s]
    assert len(mac) == 1 and "Sign the Mac app" in mac[0]


def test_npm_runs_no_install_scripts_and_the_window_is_built_before_any_secret():
    job = installers_job()
    assert "npm ci --ignore-scripts" in job and "\n      - run: npm ci\n" not in job
    built = job.index("- run: npm run build")
    assert built < job.index("secrets.MACOS_SIGN_P12 }}") and built < job.index("secrets.TAURI_SIGNING_PRIVATE_KEY }}")
    assert "beforeBuildCommand: ''" in job  # tauri doesn't build the window again with the key there


def test_only_fsevents_needs_an_install_script():
    """--ignore-scripts is safe while no package the build uses needs one (fsevents is an optional macOS watcher)."""
    import json
    lock = json.loads((ROOT / "app" / "package-lock.json").read_text())
    scripts = [k for k, v in lock["packages"].items() if v.get("hasInstallScript")]
    assert scripts in ([], ["node_modules/fsevents"]), scripts
