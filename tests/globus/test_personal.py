import os
import subprocess

from hpc_hub.globus import personal
from tests.helpers import on_linux_cluster


def test_personal_start_and_offline():
    cmd = personal.start_command(["/project/my group/me"])
    assert cmd.endswith("_ '/project/my group/me'")
    assert personal.offline("The Globus Connect Personal endpoint 'w (1)' is not currently connected to Globus")
    assert not personal.offline("Permission denied")
    assert personal.denied("PermissionDenied: Permission denied to path /scratch/mygroup/jdoe")
    assert not personal.denied("Directory not found")


@on_linux_cluster
def test_personal_start_again_with_new_folders(tmp_path):
    """Running with mygroup's folders only; asked for a new group's too: stopped, then started with all of them."""
    gcp = tmp_path / "globusconnectpersonal-3.2.0"
    gcp.mkdir()
    log, running = tmp_path / "log", tmp_path / "running"
    running.write_text("rw~/,rw/a,rw/a")
    (gcp / "globusconnectpersonal").write_text(f"""#!/bin/bash
echo "$@" >> {log}
case "$1" in
  -status) [ -s {running} ] ;;
  -stop) : > {running} ;;
  -start) echo "$3" > {running} ;;
esac
""")
    (gcp / "globusconnectpersonal").chmod(0o755)
    fake_ps = tmp_path / "bin"
    fake_ps.mkdir()
    line = f"./globusconnectpersonal -start -restrict-paths $(cat {running})"
    (fake_ps / "ps").write_text(f"#!/bin/bash\necho \"{line}\"\n")
    (fake_ps / "ps").chmod(0o755)
    env = {**os.environ, "HOME": str(tmp_path), "PATH": f"{fake_ps}:{os.environ['PATH']}"}
    same = subprocess.run(["bash", "-c", personal.start_command(["/a"])], env=env, capture_output=True, text=True)
    assert same.returncode == 0 and "-stop" not in log.read_text()
    new = subprocess.run(["bash", "-c", personal.start_command(["/a", "/b"])], env=env, capture_output=True, text=True)
    assert new.returncode == 0, new.stderr
    assert "-stop" in log.read_text() and running.read_text().strip() == "rw~/,rw/a,rw/a,rw/b,rw/b"
    log.write_text("")
    again = subprocess.run(["bash", "-c", personal.start_command(["/a", "/b"], restart=True)], env=env, text=True,
                           capture_output=True, timeout=30)
    assert again.returncode == 0 and "-stop" in log.read_text()  # the same folders, but asked to restart
