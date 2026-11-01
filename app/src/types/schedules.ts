// Shapes of what hpc_hub/api/methods/schedules.py sends.
import type { Profile } from './clusters'

/** Resources a schedule asks for instead of the cluster's node settings; empty = those settings. */
export type Compute = Partial<Pick<Profile, 'cpus' | 'mem_gb' | 'gpus' | 'partition' | 'account' | 'qos'>>

export type Schedule = {
  name: string
  agent: string
  folder: string
  task: string
  time: string  // HH:MM, cluster time
  days: number[]  // 1 = Monday ... 7 = Sunday; empty = every day
  minutes: number  // time limit of each run
  enabled: boolean
  compute: Compute
  runner?: 'agent' | 'backup'  // backup: the backup agent's weekly scratch check (task holds its settings)
}

export type ScheduleStatus = Schedule & {
  agent_name: string
  when: string  // "Weekdays at 02:00"
  job_id: string
  state: string  // PENDING (waiting for its time), RUNNING or "" (not queued)
  start: string  // when the waiting job starts, 2026-10-25T02:00:00
  last_run: number  // seconds since 1970, 0 = never
  last_log: string
}

export type Preset = { label: string; role: string; task: string }

export type ScheduleOptions = {
  agents: { id: string; name: string }[]
  presets: Preset[]
  days: string[]
  folder: string
  profile: Profile
  root: string
}

export type ScheduleLog = { path: string; text: string; folder: string }
