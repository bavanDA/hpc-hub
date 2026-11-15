from datetime import date

from hpc_hub.compute import groups


def test_course_terms():
    assert groups.is_course("2026-spring-ds-100-jdoe") and groups.is_course("lab", ["low", "course"])
    assert not groups.is_course("lab", ["low", "standard"]) and not groups.is_course("springfield")
    may = date(2026, 6, 1)
    assert groups.ended("2026-spring-ds-100-jdoe", may) == "spring 2026"
    assert groups.ended("2026-fall-ds-100-jdoe", may) == "" and groups.ended("lab", may) == ""
    assert groups.ended("2025_fall_x", may) == "fall 2025"
    assert "its term (spring 2026) is over" in groups.refused_text("2026-spring-ds-100-jdoe", may)
    assert "it may have ended" in groups.refused_text("2026-fall-ds-100-jdoe", may)


def test_hidden_groups():
    s = groups.set_hidden("", "wulver", "old", True)
    s = groups.set_hidden(s, "sdsc", "abc", True)
    assert groups.hidden(s, "wulver") == ["old"] and groups.hidden(s, "sdsc") == ["abc"]
    assert groups.set_hidden(groups.set_hidden(s, "wulver", "old", True), "wulver", "old", False) == "sdsc/abc"
