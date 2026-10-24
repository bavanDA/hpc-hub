from hpc_hub.compute import limits
from hpc_hub.core.config import ComputeProfile

WULVER = """general*|infinite
debug|8:00:00
@QOS
normal|
low|3-00:00:00
standard|3-00:00:00
debug|08:00:00
@ASSOC
debug,low,standard|
course|
"""


def test_minutes():
    assert [limits.minutes(t) for t in ("3-00:00:00", "8:00:00", "04:30:00", "30", "1-06", "infinite", "")] == [
        4320, 480, 270, 30, 1800, None, None]


def test_slurm_time_and_human():
    assert [limits.slurm_time(m) for m in (90, 1830, 4320)] == ["01:30:00", "1-06:30:00", "3-00:00:00"]
    assert [limits.human(m) for m in (4320, 1830, 45)] == ["3 days", "1 day 6 h 30 min", "45 min"]


def test_longest():
    L = limits.parse(WULVER)
    assert L.default_partition == "general" and L.allowed_qos == ["debug", "low", "standard", "course"]
    assert L.longest("general", "low") == (4320, "QoS low")
    assert L.longest("debug", "") == (480, "partition debug")
    assert L.longest("", "") == (4320, "QoS standard")  # no QoS given: the most generous one you may use
    assert limits.Limits().longest("x", "y") == (None, "")


def test_fit_cuts_time():
    L = limits.parse(WULVER)
    p, note = L.fit(ComputeProfile(time="5-00:00:00", partition="general", qos="standard"))
    assert p.time == "3-00:00:00" and "3 days" in note
    p, note = L.fit(ComputeProfile(time="04:00:00", qos="low"))
    assert p.time == "04:00:00" and not note
