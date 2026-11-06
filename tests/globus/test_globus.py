import pytest

from hpc_hub.globus import api as globus


def test_session_domains():
    msg = 'Login Failed\n530-GridFTP-JSON-Result: {"authorization_parameters": {"session_required_single_domain": ' \
          '["uni.edu"]}, "code": "permission_denied"}'
    assert globus.session_domains({}, msg) == ["uni.edu"]
    assert globus.session_domains({"authorization_parameters": {"session_required_single_domain": ["a.edu"]}}, "") \
        == ["a.edu"]
    assert globus.session_domains({}, "Permission denied") == []


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
