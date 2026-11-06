// Shapes of what hpc_hub/api/methods/{browser,preferences}.py send.
export type ChromeProfile = { folder: string; name: string; email: string }

/** Chrome profiles to open links in, and the default one ("" is the system browser). */
export type Profiles = { profiles: ChromeProfile[]; default: string }

export type Preferences = { browser_profile: string; experimental_papers: boolean; experimental_skills: boolean
  experimental_schedules: boolean; select_to_copy: boolean; monitor_bar: boolean
  appearance: import('../../theme').Appearance }

/** The experimental parts, each turned on by itself in Settings: the Papers page, the Skills and the Scheduled tabs
 *  of Agents. */
export type Experiments = { papers: boolean; skills: boolean; schedules: boolean }
export const NO_EXPERIMENTS: Experiments = { papers: false, skills: false, schedules: false }
export const experimentsOf = (p: Preferences): Experiments =>
  ({ papers: p.experimental_papers, skills: p.experimental_skills, schedules: p.experimental_schedules })
