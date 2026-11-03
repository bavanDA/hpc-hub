import pytest

from hpc_hub.projects import store


@pytest.mark.parametrize("path,user,group", [
    ("/scratch/mygroup/jdoe/proj", "jdoe", "mygroup"),
    ("/mmfs1/project/mygroup/jdoe/a", "jdoe", "mygroup"),
    ("/expanse/lustre/projects/abc123/jdoe/x", "jdoe", "abc123"),
    ("/home/jdoe/project_pi_abc/x", "jdoe", "pi_abc"),
    ("/scratch/jdoe/proj", "jdoe", ""),
    ("~/code/x", "jdoe", ""),
])
def test_group_of(path, user, group):
    assert store.group_of(path, user) == group
