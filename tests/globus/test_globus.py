import base64
import hashlib
import urllib.parse

import pytest

from hpc_hub.globus import api as globus


def test_pkce_and_url():
    verifier, challenge = globus.pkce()
    expect = base64.urlsafe_b64encode(hashlib.sha256(verifier.encode()).digest()).rstrip(b"=").decode()
    assert challenge == expect
    url = globus.authorize_url("cid", challenge)
    q = urllib.parse.parse_qs(urllib.parse.urlsplit(url).query)
    assert q["client_id"] == ["cid"] and q["code_challenge_method"] == ["S256"]
    assert q["scope"] == [globus.TRANSFER_SCOPE] and q["access_type"] == ["offline"]
    assert q["prompt"] == ["login"]
    assert "prompt=" not in globus.authorize_url("cid", challenge, fresh=False)  # only Allow, no new login


def test_pasted_code():
    code = "Ab3dE5fG7hJ9kL1mN3pQ5rS7tV9xZ1"
    assert globus.pasted_code(f"  {code}\n") == code
    assert globus.pasted_code(globus.REDIRECT + "?code=" + code) == code
    assert globus.pasted_code("https://evil.example/?code=x") == "" and globus.pasted_code("two words") == ""
    assert globus.looks_like_code(code) and not globus.looks_like_code("hello")


def test_code_from_url():
    assert globus.code_from_url(globus.REDIRECT + "?code=abc&state=x") == "abc"
    assert globus.code_from_url("https://evil.example/?code=abc") == ""


def test_merge_scopes():
    one = globus.TRANSFER_SCOPE + "[*https://auth.globus.org/scopes/c1/data_access]"
    two = globus.TRANSFER_SCOPE + "[*https://auth.globus.org/scopes/c2/data_access]"
    assert globus.merge_scopes([one, two, one]) == (globus.TRANSFER_SCOPE + "[*https://auth.globus.org/scopes/c1/"
                                                    "data_access *https://auth.globus.org/scopes/c2/data_access]")
    assert globus.merge_scopes([]) == globus.TRANSFER_SCOPE


def test_session_domains():
    msg = 'Login Failed\n530-GridFTP-JSON-Result: {"authorization_parameters": {"session_required_single_domain": ' \
          '["uni.edu"]}, "code": "permission_denied"}'
    assert globus.session_domains({}, msg) == ["uni.edu"]
    assert globus.session_domains({"authorization_parameters": {"session_required_single_domain": ["a.edu"]}}, "") \
        == ["a.edu"]
    assert globus.session_domains({}, "Permission denied") == []
    url = globus.authorize_url("cid", "ch", fresh=False, domain="uni.edu")
    assert "session_required_single_domain=uni.edu" in url


def test_transfer_tokens():
    resp = {"resource_server": "auth.globus.org", "access_token": "a",
            "other_tokens": [{"resource_server": "transfer.api.globus.org", "access_token": "t",
                              "refresh_token": "r", "expires_in": 3600}]}
    tok = globus.transfer_tokens(resp)
    assert tok["access_token"] == "t" and tok["refresh_token"] == "r"
    with pytest.raises(globus.GlobusError):
        globus.transfer_tokens({"resource_server": "auth.globus.org", "access_token": "a"})


def test_parse_ls():
    resp = {"path": "/home/bd/", "DATA": [
        {"name": "b.txt", "type": "file", "size": 5, "last_modified": "2026-10-18 12:30:00+00:00"},
        {"name": "Zed", "type": "dir", "size": 4096, "last_modified": "2026-10-17 09:00:00+00:00"},
        {"name": "a", "type": "dir"}]}
    path, items = globus.parse_ls(resp)
    assert path == "/home/bd/"
    assert [i.name for i in items] == ["a", "Zed", "b.txt"]
    assert items[2].size == 5 and not items[2].is_dir and items[2].modified == "2026-10-18 12:30"


C = globus.Collection
MAPPED, SERVER, GUEST, PERSONAL = ("GCSv5_mapped_collection", "GCSv5_endpoint", "GCSv5_guest_collection",
                                   "GCP_mapped_collection")


def test_cluster_words():
    assert globus.cluster_words("SDSC Expanse", "login.expanse.sdsc.edu") == (["expanse"], "sdsc.edu")
    assert globus.cluster_words("Wulver (NJIT)", "wulver.njit.edu") == (["wulver"], "njit.edu")


def test_best_collection_skips_servers_shares_and_tests():
    words, domain = ["bouchet"], "yale.edu"
    found = [C("1", "Yale CRC Bouchet", "site@globusid.org", SERVER, False, True),
             C("2", "PI-Bouchet", "pi@yale.edu", GUEST, True, True),
             C("3", "Bouchet testing", "ops@yale.edu", MAPPED, True, True),
             C("4", "Yale CRC Bouchet HA", "admin@yale.edu", MAPPED, True, True, "hpc@lists.yale.edu")]
    assert globus.best(found, words, domain).id == "4"
    assert [c.id for c in globus.ranked(found, words, domain)] == ["4", "2", "3"]  # no server
    assert globus.best(found[:3], words, domain) is None  # nothing clearly it: you pick


def test_best_collection_falls_back_to_yours():
    words, domain = ["wulver"], "njit.edu"
    assert globus.best([C("9", "wulver-jdoe", "jdoe@njit.edu", PERSONAL, mine=True)], words, domain).id == "9"
    assert globus.best([C("9", "wulver-jdoe", "jdoe@njit.edu", PERSONAL)], words, domain) is None  # someone else's


def test_check_collections_replaces_broken_ones():
    from hpc_hub.core import config
    good = C("good", "SDSC HPC - Expanse Lustre", "site@globusid.org", MAPPED, True, True, "help@sdsc.edu")

    class Fake:
        def collection(self, cid):
            return {"server": C("server", "x", "", SERVER, False), "good": good}[cid]

        def find_for(self, name, host):
            return good if "Expanse" in name else None
    clusters = config.default_clusters()
    by_id = {c.id: c for c in clusters}
    by_id["sdsc"].globus.collection_id = "server"
    by_id["yale"].globus.collection_id = "good"
    assert globus.check_collections(Fake(), clusters) == {"sdsc": good}  # wulver: none found, nothing saved


def test_personal_start_and_offline():
    cmd = globus.personal_start(["/project/my group/me"])
    assert cmd.endswith("_ '/project/my group/me'")
    assert globus.personal_offline("The Globus Connect Personal endpoint 'w (1)' is not currently connected to Globus")
    assert not globus.personal_offline("Permission denied")
    assert globus.denied("PermissionDenied: Permission denied to path /scratch/mygroup/jdoe")
    assert not globus.denied("Directory not found")


def test_personal_start_again_with_new_folders(tmp_path):
    """Running with mygroup's folders only; asked for a new group's too: stopped, then started with all of them."""
    import os
    import subprocess
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
    same = subprocess.run(["bash", "-c", globus.personal_start(["/a"])], env=env, capture_output=True, text=True)
    assert same.returncode == 0 and "-stop" not in log.read_text()
    new = subprocess.run(["bash", "-c", globus.personal_start(["/a", "/b"])], env=env, capture_output=True, text=True)
    assert new.returncode == 0, new.stderr
    assert "-stop" in log.read_text() and running.read_text().strip() == "rw~/,rw/a,rw/a,rw/b,rw/b"
    log.write_text("")
    again = subprocess.run(["bash", "-c", globus.personal_start(["/a", "/b"], restart=True)], env=env, text=True,
                           capture_output=True, timeout=30)
    assert again.returncode == 0 and "-stop" in log.read_text()  # the same folders, but asked to restart


def test_task_info():
    t = {"status": "ACTIVE", "nice_status": "OK", "bytes_transferred": 2048, "files": 10, "files_transferred": 3,
         "files_skipped": 2, "effective_bytes_per_second": 512}
    i = globus.task_info(t)
    assert (i.files_done, i.files, i.problem, i.finished) == (5, 10, "", False)
    assert globus.task_info({"status": "INACTIVE", "nice_status": "PERMISSION_DENIED"}).problem == "PERMISSION_DENIED"
    assert globus.task_info({"status": "SUCCEEDED", "nice_status": None}).finished
    assert globus.task_info({"status": "FAILED", "fatal_error": {"code": "CANCELED"}}).cancelled


def test_collection_path():
    expanse = {"projects", "scratch"}
    assert globus.collection_path("/expanse/lustre/scratch/me/temp_project/x", expanse) == "/scratch/me/temp_project/x"
    assert globus.collection_path("/home/me/x/", {"home", "nfs"}) == "/home/me/x/"
    with pytest.raises(globus.GlobusError):
        globus.collection_path("/home/me", expanse)
