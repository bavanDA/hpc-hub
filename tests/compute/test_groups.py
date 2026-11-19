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


# -- which group is billed when you pick none (2026-11-19: an old course group was billed and refused) ---------

def test_billed_is_slurms_default_when_it_is_an_ordinary_group():
    assert groups.billed("ab12", {"ab12": ["standard"], "cd34": ["low"]}, []) == "ab12"


def test_billed_passes_over_a_course_default_for_your_own_group():
    qos = {"2025-spring-ds-100-ab12-jdoe": ["course"], "ab12": ["standard"]}
    assert groups.billed("2025-spring-ds-100-ab12-jdoe", qos, []) == "ab12"


def test_billed_passes_over_a_hidden_default():
    assert groups.billed("ab12", {"ab12": ["standard"], "cd34": ["low"]}, ["ab12"]) == "cd34"


def test_billed_is_nothing_when_every_group_is_a_course_or_hidden():
    assert groups.billed("2025-fall-x-jdoe", {"2025-fall-x-jdoe": ["course"]}, []) == ""
    assert groups.billed("ab12", {"ab12": ["standard"]}, ["ab12"]) == ""


def test_an_ordinary_group_allowed_the_course_priority_is_not_a_course_group():
    assert not groups.course_only("ab12", ["low", "standard", "course"])
    assert groups.course_only("lab", ["course"])
    assert groups.course_only("2026-spring-cs-100-jdoe")
    assert not groups.course_only("ab12")
