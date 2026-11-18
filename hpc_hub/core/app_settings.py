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
    select_everywhere: bool = False  # highlighting text anywhere in the window copies it (not in text boxes)
    right_click_paste: bool = False  # right-clicking a terminal pastes, instead of opening its menu
    monitor_bar: bool = True  # CPU, memory and network of the host under each terminal
    appearance: str = "system"  # system (follows the computer), light, dark or a named one
    # the agent for a paper's Write message, Ask and Check my list (latex/assist/), Claude Haiku, Low at first
    paper_agent: str = "claude"
    paper_model: str = "haiku"
    paper_effort: str = "low"
    paper_split: bool = True  # Write message may suggest several commits
    beta_updates: bool = False  # updates from the beta channel too: fixes within minutes, less tested
    own_vpn: bool = False  # Windows: HPC Hub's own VPN, which needs no administrator (connect/vpn_local.py)
    hidden_groups: str = ""  # groups to bill left out of Get one: "wulver/2026-spring-...,sdsc/abc123"


EXPERIMENTS = ("experimental_papers", "experimental_skills", "experimental_schedules")
APPEARANCES = ("system", "light", "dark", "charcoal", "daylight", "frost", "dusk", "sand")
