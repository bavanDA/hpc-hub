from hpc_hub.compute import job_text as t
from hpc_hub.compute import jobs


def test_times_and_reasons_read_like_words():
    assert [t.duration_text(s) for s in (259200, 93600, 14400, 4320, 720, 20)] == [
        "3 days", "1 day 2 h", "4 h", "1 h 12 min", "12 min", "under 1 min"]
    assert t.reason_text("(Priority)") == "Waiting: higher-priority jobs go first"
    assert t.reason_text("(Resources)") == "Waiting: not enough free nodes yet"
    assert t.reason_text("(AssocGrpBillingMinutes)") == "Waiting: your group is out of SUs"
    assert t.reason_text("(DependencyNeverSatisfied)") == "Won't start: the job it waits for failed"
    assert t.reason_text("(SomethingNew)") == "Waiting: SomethingNew"
    assert t.reason_text("(None)") == "Waiting to start"
    assert t.reason_text("n0042") == ""


def test_qos_only_when_it_tells_you_something():
    j = jobs.parse_jobs("1|x|me|general|RUNNING|1:00|4:00:00|2|8G|n1|low\n"
                        "2|y|me|debug|RUNNING|1:00|30:00|1|4G|n2|debug\n")
    assert [t.shown_qos(x) for x in j] == ["low", ""]


def test_qos_reads_as_a_priority():
    assert [t.priority_name(q) for q in ("low", "standard", "high_mygroup")] == ["Low", "Standard", "High (mygroup)"]


def test_details_read_like_words():
    assert t.state_text("PENDING", "Priority") == "Waiting: higher-priority jobs go first"
    assert t.state_text("PENDING") == "Waiting to start"
    assert t.state_text("CANCELLED by 4242") == "Cancelled" and t.state_text("TIMEOUT") == "Ran out of time"
    assert t.state_text("RESIZING") == "Resizing" and t.state_text("") == ""
    assert t.mem_text("64G") == "64 GB" and t.mem_text("500M") == "500 MB" and t.mem_text("1536G") == "1.5 TB"
    assert t.mem_text("2048Mn") == "2 GB" and t.mem_text("lots") == "lots"
    assert t.date_text("2026-10-04T09:31:05") == "Oct 4, 09:31" and t.date_text("Unknown") == "Unknown"


def _rows(groups: list[dict]) -> list[dict[str, str]]:
    return [{r["label"]: r["value"] for r in g["rows"]} for g in groups]


def test_waiting_job_details():
    status, res, files = _rows(t.detail_groups({"JobState": "PENDING", "Reason": "Resources",
                                                "TimeLimit": "3-00:00:00", "Partition": "general", "QOS": "low",
                                                "Account": "mygroup", "StartTime": "Unknown"}))
    assert status == {"State": "Waiting: not enough free nodes yet", "Run time": "3 days asked"}
    assert res == {"Queue": "general", "Priority": "Low", "Charged to": "mygroup"} and files == {}


def test_finished_job_details_from_sacct():
    d = {"State": "FAILED", "Elapsed": "01:30:00", "Timelimit": "04:00:00", "Start": "2026-10-04T09:31:05",
         "End": "2026-10-04T11:01:05", "ExitCode": "2:0", "NodeList": "n0042", "AllocCPUS": "8",
         "AllocTRES": "cpu=8,mem=32G,gres/gpu=1,gres/gpu:a100_10g=1", "Partition": "gpu", "QOS": "standard",
         "StdOut": "/home/jdoe/run.out", "StdErr": "/home/jdoe/run.err", "WorkDir": "/home/jdoe"}
    status, res, files = _rows(t.detail_groups(d, "wulver"))
    assert status == {"State": "Failed", "Run time": "1 h 30 min of 4 h", "Started": "Oct 4, 09:31",
                      "Ended": "Oct 4, 11:01", "Exit code": "2, the program reported an error"}
    assert res == {"Node": "n0042", "Cores": "8", "Memory": "32 GB", "GPU": "A100, 10 GB slice", "Queue": "gpu",
                   "Priority": "Standard"}
    assert files == {"Work folder": "/home/jdoe", "Output": "/home/jdoe/run.out", "Errors": "/home/jdoe/run.err"}
    same = _rows(t.detail_groups({**d, "StdErr": d["StdOut"], "QOS": "gpu"}))
    assert "Errors" not in same[2] and "Priority" not in same[1]


def test_exit_codes_in_words():
    assert t.exit_text("0:0") == "0, finished without errors"
    assert t.exit_text("1:0") == "1, the program reported an error"
    assert t.exit_text("0:9") == "Stopped by signal 9"
    assert t.exit_text("") == ""
