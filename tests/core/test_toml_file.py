import tomllib
from dataclasses import dataclass, field

from hpc_hub.core.toml_file import merge, table, toml_value, write_atomic


@dataclass
class Inner:
    name: str = "a"


@dataclass
class Outer:
    on: bool = False
    minutes: int = 0
    label: str = ""
    inner: Inner = field(default_factory=Inner)


def test_merge_keeps_types_and_skips_wrong_ones():
    o = Outer()
    merge(o, {"on": 1, "minutes": "ten", "label": "x", "inner": {"name": "b"}, "unknown": 5})
    assert o == Outer(on=True, minutes=0, label="x", inner=Inner("b"))


def test_merge_turns_old_hours_into_minutes():
    o = Outer()
    merge(o, {"hours": 2})
    assert o.minutes == 120
    merge(o, {"hours": 2, "minutes": 5})
    assert o.minutes == 5


def test_toml_value():
    assert [toml_value(v) for v in (True, False, 3, 'say "hi"', "é")] == ["true", "false", "3", '"say \\"hi\\""', '"é"']


def test_table_nests_dicts_and_reads_back():
    out: list[str] = []
    table(out, "clusters.abc123", {"host": "h", "port": 22, "vpn": {"on": True}})
    assert tomllib.loads("\n".join(out)) == {"clusters": {"abc123": {"host": "h", "port": 22, "vpn": {"on": True}}}}


def test_write_atomic_makes_the_folder(tmp_path):
    path = tmp_path / "a" / "b.toml"
    write_atomic(path, "x = 1\n")
    assert path.read_text() == "x = 1\n"
    assert not path.with_suffix(".tmp").exists()
