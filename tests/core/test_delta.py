"""NCSA Delta, built in (2026-11-23, owner: "can you add NCSA Delta as well"). Its facts are from NCSA's Delta docs
(hpc_hub/clusters/delta.py)."""

from hpc_hub import clusters
from hpc_hub.connect import prompts
from hpc_hub.core import config

DELTA = next(c for c in config.default_clusters() if c.id == "delta")


def test_delta_is_offered_with_the_others():
    assert [c.id for c in config.default_clusters()] == ["wulver", "yale", "sdsc", "delta"]
    assert DELTA.name == "NCSA Delta" and DELTA.short == "Delta" and DELTA.org == "NCSA"


def test_it_signs_in_with_the_ncsa_password_and_duo_no_keys_no_vpn():
    assert DELTA.host == "login.delta.ncsa.illinois.edu" and DELTA.port == 22
    assert DELTA.username_label == "NCSA username"
    assert DELTA.password_only and not DELTA.key_login and not DELTA.key_page  # keys are off for general use
    assert DELTA.second_factor == "duo" and DELTA.duo_answer == "push"
    assert not DELTA.vpn.enabled and "login.delta.ncsa.illinois.edu" not in clusters.vpn_gateways()


def test_ncsas_duo_menu_gets_push():
    """The shape of the prompt NCSA's docs show: Duo Push is option 1."""
    menu = ("Duo two-factor login for jdoe\n\nEnter a passcode or select one of the following options:\n\n"
            " 1. Duo Push to XXX-XXX-1234\n 2. Phone call to XXX-XXX-1234\n\nPasscode or option (1-2): ")
    assert prompts.classify(menu) == prompts.DUO
    assert prompts.duo_reply(menu, DELTA.duo_answer) == "1"
    assert prompts.classify("jdoe@login.delta.ncsa.illinois.edu's password: ") == prompts.PASSWORD


def test_jobs_go_to_its_queues():
    assert DELTA.profile.partition == "cpu" and DELTA.vscode.compute.partition == "cpu"
    site = clusters.site("delta")
    assert {queue for _, queue in site.gpu_docs} == {"gpuA100x4", "gpuA40x4", "gpuA100x8", "gpuH200x8"}
    assert site.help_email == "help@ncsa.illinois.edu"
    assert site.purge and site.purge.days == 0 and "docs.ncsa.illinois.edu" in site.purge.source_url
