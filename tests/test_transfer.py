import pytest

from hpc_hub import transfer
from tests.test_remote_fs import LocalShell


def test_copy_folder_between_shells(tmp_path):
    src = tmp_path / "a" / "my data"
    (src / "sub").mkdir(parents=True)
    (src / "sub" / "x.bin").write_bytes(b"0" * 3_000_000)
    (src / "r.txt").write_text("hi")
    dest = tmp_path / "b" / "inbox"
    progress, updates = transfer.Progress(), []
    transfer.copy(LocalShell(), str(src), LocalShell(), str(dest), progress, updates.append)
    assert (dest / "my data" / "sub" / "x.bin").stat().st_size == 3_000_000
    assert (dest / "my data" / "r.txt").read_text() == "hi"
    assert progress.finished and progress.done >= 3_000_000 and progress.total >= 3_000_000
    assert len(updates) > 1


def test_copy_missing_source(tmp_path):
    progress = transfer.Progress()
    with pytest.raises(transfer.TransferError):
        transfer.copy(LocalShell(), str(tmp_path / "nope"), LocalShell(), str(tmp_path / "d"), progress)
    assert progress.error


def test_copy_leaves_out_skipped_subfolders(tmp_path):
    src = tmp_path / "myproject"
    for d in ("baselines/big", "build", "results"):
        (src / d).mkdir(parents=True)
    (src / "baselines" / "big" / "x.bin").write_bytes(b"0" * 2_000_000)
    (src / "results" / "r.txt").write_text("ok")
    (src / "build" / "baselines").mkdir()  # same name deeper down is kept
    sizes = dict(transfer.subfolder_sizes(LocalShell(), str(src)))
    assert sizes["baselines"] >= 2_000_000 and "results" in sizes
    dest = tmp_path / "out"
    transfer.copy(LocalShell(), str(src), LocalShell(), str(dest), transfer.Progress(), skip=["baselines"])
    assert (dest / "myproject" / "results" / "r.txt").read_text() == "ok"
    assert not (dest / "myproject" / "baselines").exists() and (dest / "myproject" / "build" / "baselines").is_dir()
