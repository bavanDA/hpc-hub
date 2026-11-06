"""Experimental features (Papers, Skills, Scheduled agents): each hidden unless you turn it on in Settings."""

EXPERIMENTAL_PAGES = ("latex", "skills", "schedules")

papers = False  # the Papers (LaTeX) page, and Open in LaTeX for a .tex file
skills = False  # the Skills tab of Agents
schedules = False  # the Scheduled tab of Agents

select_to_copy = True  # Settings: highlighting terminal text copies it
monitor_bar = True  # Settings: CPU, memory and network of the host under each terminal


def load(app) -> None:
    """Take the three switches from AppSettings."""
    global papers, skills, schedules
    papers, skills, schedules = app.experimental_papers, app.experimental_skills, app.experimental_schedules


def shown(page: str) -> bool:
    """Whether a page of the window shows (the experimental ones only while their switch is on)."""
    return {"latex": papers, "skills": skills, "schedules": schedules}.get(page, True)
