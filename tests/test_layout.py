from hpc_hub.core import layout


def test_round_trip(tmp_path):
    f = tmp_path / "layout.json"
    layout.save({"terminals": 320}, f)
    assert layout.load(f) == {"terminals": 320}


def test_bad_file(tmp_path):
    f = tmp_path / "layout.json"
    assert layout.load(f) == {}
    f.write_text("{oops")
    assert layout.load(f) == {}
    f.write_text('{"a": "x", "b": 5}')
    assert layout.load(f) == {"b": 5}
