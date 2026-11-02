"""GPU types from Slurm's gres column, their names, and the request they make."""

import pytest

from hpc_hub.api import hub as hub_mod
from hpc_hub.api.hub import Hub
from hpc_hub.api.methods import clusters
from hpc_hub.compute import gpus, limits, slurm
from hpc_hub.core import config
from hpc_hub.core.config import ComputeProfile

WULVER = """gpu*|1-00:00:00
@QOS
@ASSOC
@GRES
gpu*|gpu:a100:4(S:0-1)
gpu*|gpu:a100_10g:2,gpu:a100_20g:1,gpu:a100_40g:1
general|(null)
debug_gpu|gpu:a100_10g:4
"""


def test_gres_column_becomes_gpu_types():
    lim = limits.parse(WULVER)
    assert lim.gres == {"gpu": ["gpu:a100:4", "gpu:a100_10g:2", "gpu:a100_20g:1", "gpu:a100_40g:1"],
                        "debug_gpu": ["gpu:a100_10g:4"]}
    found = gpus.options(lim.gres, "wulver")
    assert [(g.type, g.label, g.memory_gb, g.slice, g.max_per_job) for g in found] == [
        ("a100_10g", "A100, 10 GB slice", 10, True, 1), ("a100_20g", "A100, 20 GB slice", 20, True, 1),
        ("a100_40g", "A100, 40 GB slice", 40, True, 1), ("a100", "A100", 80, False, 4)]
    assert found[0].partitions == ["gpu", "debug_gpu"]


def test_unknown_types_and_untyped_gpus():
    assert gpus.describe("h100") == ("H100", 80, False)
    assert gpus.describe("v100s_16g") == ("V100S, 16 GB slice", 16, True)
    assert gpus.describe("weird_card") == ("WEIRD CARD", 0, False)
    sdsc = gpus.options({"gpu-shared": ["gpu:4"]}, "sdsc")
    assert [(g.type, g.label, g.memory_gb) for g in sdsc] == [("", "V100", 32)]


def test_the_docs_stand_in_before_the_first_login():
    assert [g.type for g in gpus.from_docs("wulver")] == ["a100_10g", "a100_20g", "a100_40g", "a100"]
    yale = {g.type: g.partitions for g in gpus.from_docs("yale")}
    assert yale["h100"] == ["gpu_h100"] and yale["l40s"] == ["gpu"]
    assert gpus.from_docs("elsewhere") == []


def test_the_request_names_the_type():
    p = ComputeProfile(gpus=1, gpu_type="a100_10g", partition="gpu")
    assert "--gres=gpu:a100_10g:1" in slurm.resource_args(p)
    assert "--gres=gpu:2" in slurm.resource_args(ComputeProfile(gpus=2))
    assert "GPU type has invalid characters" in slurm.validate(ComputeProfile(gpus=1, gpu_type="a100;rm"))
    assert p.summary() == "2 cores · 16 GB · 4 h · A100, 10 GB slice"  # the size, not the queue
    assert "2 × H100" in ComputeProfile(gpus=2, gpu_type="h100").summary()


class Session:
    def __init__(self, cfg, lim=None):
        self.cfg, self.limits = cfg, lim


@pytest.fixture
def hub(monkeypatch):
    h = Hub.__new__(Hub)
    h.clusters = config.default_clusters()
    h.sessions = {c.id: Session(c) for c in h.clusters}
    monkeypatch.setattr(hub_mod, "_hub", h)
    return h


def test_api_lists_gpus_and_checks_slices(hub):
    assert clusters.gpus("wulver") == {"known": False, "gpus": gpus.as_json(gpus.from_docs("wulver"))}
    hub.sessions["wulver"].limits = limits.parse(WULVER)
    got = clusters.gpus("wulver")
    assert got["known"] and got["gpus"][0]["type"] == "a100_10g"
    base = hub.sessions["wulver"].cfg.profile
    with pytest.raises(ValueError, match="One GPU slice per job"):
        clusters._profile(base, {"gpus": 2, "gpu_type": "a100_10g"})
    assert clusters._profile(base, {"gpus": 0, "gpu_type": "a100_10g"}).gpu_type == ""
    assert clusters._profile(base, {"gpus": 2, "gpu_type": "a100"}).gpus == 2
