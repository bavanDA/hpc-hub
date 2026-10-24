// Shapes of what the jobs.* methods send (see hpc_hub/api/methods/jobs.py and hpc_hub/compute/jobs.py).
import type { Account } from './usage'

export type Scope = 'mine' | 'history' | 'all'

export type Job = {
  job_id: string
  name: string
  user: string
  partition: string
  state: string
  elapsed: string
  limit: string
  cpus: string
  mem: string
  where: string // node list, or pending reason
  qos: string
  billing: number
  factor: number // QoS usage factor, 0 = free
  from_app: boolean
  su_spent: number
  su_max: number
  su: string // "9.0 / 24", "free"
  seconds: number
  limit_seconds: number
  cancellable: boolean // yours, and still running or waiting
}

export type JobList = { jobs: Job[]; user: string; accounts: Account[]; app_job: string }

export type DetailGroup = { title: string; rows: { label: string; value: string }[] }
export type JobDetails = { groups: DetailGroup[]; text: string }

export type Inside = { sessions: string[]; app_node: boolean }
