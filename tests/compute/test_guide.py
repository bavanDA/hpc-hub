from hpc_hub.compute import guide, limits

EXPANSE = """compute|2-00:00:00|128|257400+
gpu-shared|2-00:00:00|64|507233
debug|30:00|128|257400
shared*|2-00:00:00|128|257400+
empty|1:00:00|0|0
@QOS
normal|2-00:00:00|cpu=4096,node=32|cpu=8192,node=64|1.000000
shared-normal|2-00:00:00|cpu=127,node=1|cpu=8192,node=64|1.000000
debug-normal|01:00:00|cpu=256,node=2|cpu=256,node=2|1.000000
gpu-shared-normal|2-00:00:00|cpu=37,gres/gpu=3,mem=353000M,node=1||1.000000
@ASSOC
xyz789|debug-normal,normal,shared-normal|shared-normal
@USER
xyz789
@GRES
gpu-shared|gpu:a100:4(S:0-1,3)
@PARTS
PartitionName=compute AllowQos=normal,unlim DefaultTime=01:00:00 \
MaxNodes=32 MaxCPUsPerNode=128 OverSubscribe=EXCLUSIVE \
MaxMemPerNode=249208 TotalNodes=734 State=UP TRESBillingWeights=cpu=3600,mem=1800.00G,node=460800
PartitionName=gpu-shared AllowQos=gpu-shared-normal MaxNodes=1 TotalNodes=56 State=UP
PartitionName=debug AllowQos=debug-normal DefaultTime=00:15:00 MaxNodes=2 \
DefMemPerCPU=1024 MaxMemPerNode=249208 TotalNodes=2
PartitionName=shared AllowQos=shared-normal DefaultTime=01:00:00 MaxNodes=1 \
MaxMemPerNode=249325 TotalNodes=734 PreemptMode=REQUEUE
PartitionName=empty AllowQos=ALL TotalNodes=0 State=UP
@FLAGS
PriorityFlags           = CALCULATE_RUNNING,MAX_TRES
"""


def queues(lim):
    return {q["name"]: q for q in guide.guide(lim)["queues"]}


def test_only_the_queues_you_can_use():
    got = guide.guide(limits.parse(EXPANSE))
    assert [q["name"] for q in got["queues"]] == ["shared", "compute", "debug"]  # your default comes first
    assert got["others"] == 2  # gpu-shared wants a QoS you don't have; empty has no nodes


def test_what_one_job_may_ask_for():
    q = queues(limits.parse(EXPANSE))
    assert (q["shared"]["longest"], q["shared"]["max_nodes"], q["shared"]["cores"]) == (2880, 1, 127)
    assert q["shared"]["memory_gb"] == 243  # MaxMemPerNode, not what the nodes have
    assert (q["compute"]["max_nodes"], q["compute"]["cores"], q["compute"]["cores_per_node"]) == (32, 4096, 128)
    assert q["debug"]["longest"] == 30 and q["debug"]["default_time"] == 15
    assert q["debug"]["default_mem_per_core_gb"] == 1.0


def test_whole_nodes_and_jobs_that_can_be_stopped():
    q = queues(limits.parse(EXPANSE))
    assert q["compute"]["whole_nodes"] and not q["shared"]["whole_nodes"]
    assert q["shared"]["can_be_stopped"] and not q["compute"]["can_be_stopped"]


def test_a_queue_with_no_limit_says_so():
    lim = limits.parse("general*|infinite|128|512000\n@PARTS\nPartitionName=general MaxNodes=UNLIMITED State=UP\n")
    q = queues(lim)["general"]
    assert q["longest"] is None and q["max_nodes"] is None and q["cores"] == 128


def test_the_priority_decides_on_wulver():
    lim = limits.parse("general*|infinite|128|512000\ndebug|8:00:00|128|512000\n@QOS\n"
                       "low|3-00:00:00|||0.000000\nstandard|3-00:00:00||gres/gpu:l40=0|1.000000\n"
                       "long|14-00:00:00|||1.000000\ndebug|08:00:00|cpu=4,mem=16G|cpu=4,mem=16G|0.000000\n"
                       "@ASSOC\nmygroup|debug,low,standard,long|standard\n@PARTS\n"
                       "PartitionName=general DenyQos=debug MaxNodes=UNLIMITED TotalNodes=97 State=UP\n"
                       "PartitionName=debug AllowQos=debug TotalNodes=2 State=UP\n")
    got = guide.guide(lim)
    q = {x["name"]: x for x in got["queues"]}
    assert q["general"]["longest"] == 20160  # the longest priority you may use on it
    assert (q["debug"]["cores"], q["debug"]["memory_gb"]) == (4, 16)
    rows = {x["name"]: x for x in got["qos"]}
    assert rows["low"]["factor"] == 0 and rows["low"]["queues"] == ["general"]
    assert rows["debug"]["per_job"] == {"cpu": 4, "mem": 16} and rows["debug"]["queues"] == ["debug"]


def test_gpus_a_job_can_have():
    lim = limits.parse(EXPANSE.replace("xyz789|debug-normal,", "xyz789|gpu-shared-normal,debug-normal,"))
    assert queues(lim)["gpu-shared"]["gpus"] == [{"type": "a100", "count": 3, "per_node": 4}]


def test_groups_that_a_queue_refuses():
    lim = limits.parse("a*|1:00:00|4|8000\nb|1:00:00|4|8000\n@ASSOC\nmygroup|x|x\n@PARTS\n"
                       "PartitionName=a AllowAccounts=ALL State=UP\nPartitionName=b AllowAccounts=other State=UP\n")
    assert list(queues(lim)) == ["a"]
