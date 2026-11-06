from hpc_hub.files.status import size_text, task_line
from hpc_hub.globus.api import TaskInfo


def test_size_text():
    assert size_text(999) == "999 bytes"
    assert size_text(1500) == "1.5 kB" and size_text(2_000_000) == "2.0 MB"
    assert size_text(5e15) == "5000.0 TB"


def test_task_line():
    assert task_line(TaskInfo("SUCCEEDED", 5000, 4, 4, 0, "")) == "Done · 5.0 kB · 4 files"
    assert task_line(TaskInfo("FAILED", 0, 0, 3, 0, "", cancelled=True)) == "Cancelled"
    assert task_line(TaskInfo("FAILED", 0, 0, 3, 0, "PERMISSION_DENIED")) == "Failed: permission denied"
    assert task_line(TaskInfo("FAILED", 0, 0, 3, 0, "")) == "Failed"
    assert task_line(TaskInfo("ACTIVE", 0, 0, 0, 0, "")) == "Counting files · 0 bytes"
    assert task_line(TaskInfo("INACTIVE", 2000, 1, 4, 1500.5, "PAUSED_BY_ADMIN")) == \
        "paused by admin · 2.0 kB · 1 of 4 files · 1.5 kB/s"
