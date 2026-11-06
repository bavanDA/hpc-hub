"""App-wide settings, saved in app.toml."""

from dataclasses import dataclass


@dataclass
class AppSettings:
    globus_client_id: str = ""  # your Globus native app id (app.globus.org/settings/developers)
    browser_profile: str = ""  # Chrome profile name for links (e.g. "Uni"); empty = system browser
    # experimental pages, each on its own (an older app.toml had one `experimental` for all three: load_app)
    experimental_papers: bool = False  # the Papers page
    experimental_skills: bool = False  # the Skills tab of Agents
    experimental_schedules: bool = False  # the Scheduled tab of Agents
    clusters: str = ""  # ids of the clusters you use, comma separated; empty = all of them
    select_to_copy: bool = True  # highlighting text in a terminal copies it
    monitor_bar: bool = True  # CPU, memory and network of the host under each terminal
    appearance: str = "system"  # system (follows the computer), light, dark or a named one
    # the agent for a paper's Write message, Ask and Check my list (latex/assist/), Claude Haiku, Low at first
    paper_agent: str = "claude"
    paper_model: str = "haiku"
    paper_effort: str = "low"
    paper_split: bool = True  # Write message may suggest several commits


EXPERIMENTS = ("experimental_papers", "experimental_skills", "experimental_schedules")
APPEARANCES = ("system", "light", "dark", "charcoal", "daylight", "frost", "dusk", "sand")
