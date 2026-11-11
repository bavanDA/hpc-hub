from hpc_hub.compute import maintenance as m

CLOCK = "2026-11-08T16:45:00\nEST\n"
WHOLE = ("ReservationName=Nov_10_Sched_Maint StartTime=2026-11-10T07:50:00 EndTime=2029-08-05T08:50:00 "
         "Duration=999-00:00:00 Nodes=n[0001-0127] Flags=MAINT,IGNORE_JOBS,SPEC_NODES,ALL_NODES\n")
LATER = WHOLE.replace("2026-11-10T07:50", "2026-12-08T08:50").replace("Nov_10", "Dec_08")
BROKEN = ("ReservationName=maint StartTime=2025-04-14T17:24:00 EndTime=2030-05-15T12:00:00 Nodes=exp-1-13 "
          "Flags=MAINT,IGNORE_JOBS,SPEC_NODES\n")


def test_the_next_maintenance_of_the_whole_cluster():
    got = m.parse(CLOCK + LATER + WHOLE)
    assert (got.start, got.tz, got.minutes_left, got.active) == ("2026-11-10T07:50:00", "EST", 2345, False)


def test_a_few_broken_nodes_are_not_maintenance():
    assert m.parse(CLOCK + BROKEN) is None


def test_under_way():
    got = m.parse("2026-11-10T09:00:00\nEST\n" + WHOLE)
    assert got.active and got.minutes_left == 0


def test_nodes_all_and_nothing_booked():
    assert m.parse(CLOCK + WHOLE.replace("Nodes=n[0001-0127]", "Nodes=ALL").replace(",ALL_NODES", "")) is not None
    assert m.parse(CLOCK) is None and m.parse("") is None and m.parse("no clock\nEST\n" + WHOLE) is None
