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


def test_groups_to_bill_and_their_priorities():
    L = limits.parse("general*|infinite\n@ASSOC\nmygroup|debug,low,standard|\ndept_x|debug,high_dept_x,normal|\n"
                     "@USER\nmygroup\n")
    assert L.account_qos == {"mygroup": ["debug", "low", "standard"], "dept_x": ["debug", "high_dept_x", "normal"]}
    assert L.default_account == "mygroup" and L.allowed_qos == ["debug", "low", "standard", "high_dept_x", "normal"]


def test_biggest_node():
    L = limits.parse("general*|infinite|128|515000\ngeneral*|infinite|64+|256000\ngpu|2-00:00:00|64|512000\n"
                     "debug|8:00:00\n")
    assert L.biggest("") == (128, 502) and L.biggest("gpu") == (64, 500)
    assert L.biggest("debug") == (None, None) and "debug" in L.partitions


def test_priority_caps_and_memory_per_core():
    L = limits.parse("general*|infinite|128|450000+\ngpu|infinite|128|514000\ndebug|8:00:00|128|514000\n"
                     "@QOS\nstandard|3-00:00:00|gres/gpu:l40=0|\ndebug|08:00:00|cpu=4,mem=16G|cpu=4,mem=16G\n"
                     "course|3-00:00:00||cpu=128,gres/gpu=1\n@ASSOC\nmygroup|debug,low,standard|standard\n"
                     "@PARTS\nPartitionName=gpu MaxNodes=UNLIMITED MaxMemPerCPU=4015 State=UP\n"
                     "PartitionName=general MaxMemPerNode=UNLIMITED State=UP\n")
    assert L.biggest("debug", "debug") == (4, 16) and L.biggest("gpu", "standard") == (128, 501)
    assert L.mem_per_core_mb == {"gpu": 4015}
    assert L.gpu_caps("standard") == {"l40": 0} and L.gpu_caps("course") == {"": 1} and L.gpu_caps("low") == {}


def test_billing_weights_and_usage_factor():
    L = limits.parse("general*|infinite|128|450000+\ngpu|infinite|128|514000\n"
                     "@QOS\nstandard|3-00:00:00|||1.000000\nlow|3-00:00:00|||0.000000\n"
                     "@ASSOC\nmygroup|low,standard|standard\n@PARTS\n"
                     "PartitionName=gpu TRESBillingWeights=CPU=1.0,Mem=0.25G,GRES/gpu=0,gres/gpu:a100=16.0 State=UP\n"
                     "PartitionName=bigmem TRESBillingWeights=CPU=1.5,Mem=96 State=UP\n"
                     "PartitionName=general State=UP\n@FLAGS\nPriorityFlags           = MAX_TRES_GRES\n")
    assert L.billing["gpu"] == {"cpu": 1.0, "mem": 0.25, "gpu": 0.0, "gpu:a100": 16.0}
    assert L.billing["bigmem"] == {"cpu": 1.5, "mem": 96 * 1024}
    assert L.billing_for("gpu") == {"weights": L.billing["gpu"], "max": "gres", "factor": 1.0}
    assert L.billing_for("gpu", "low")["factor"] == 0.0
    assert L.billing_for("general") is None
