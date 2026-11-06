// Shapes of what the usage.* methods send (see hpc_hub/api/methods/usage.py and hpc_hub/compute/usage.py).
export type Account = {
  account: string
  quota: number // SU the account may use, 0 = no limit
  used: number // SU the whole account used
  mine: number // SU you used in it
  period: string // what used covers when not all time (Yale: the fiscal year, "FY27")
  rate: number // dollars per SU where SU are billed (Yale)
}

export type Person = { user: string; name: string; charged: number; hours: number }
export type People = { people: Person[]; me: string }

export type StorageRow = {
  label: string
  used: number // GB
  quota: number // GB, 0 = no quota
  mine: number | null // GB you use in it
  people: Record<string, number> // user -> GB
  files?: number // 0 = not known
  file_limit?: number
  backup?: string // Yes or No, as the quota tool says
  purged?: number // days before files are deleted, 0 = never or not said
}
export type Storage = { rows: StorageRow[]; raw: string }

export type Partition = {
  name: string
  up: boolean
  nodes: number
  cpus_used: number
  cpus_total: number
  gpus_used: number
  gpus_total: number
  running: number
  pending: number
}

/** usage.allocations: a group you can bill with its last 12 weeks and where this pace leads. */
export type Allocation = Account & {
  weeks: number[] | null // SUs per week, oldest first, the last ending today; null = the cluster could not tell
  people: Record<string, number> // user -> SUs over those 12 weeks
  per_day: number | null // SUs a day over the last 4 weeks
  days_left: number | null // at that pace; null = no limit, nothing used lately, or not known
  runs_out: string // ISO day it runs out at that pace, '' = see days_left
  end: string // ISO day the allocation period ends as the cluster says, '' = not said
  near: boolean // runs out before the end (or within 30 days when the end is not known), or used up
}
export type Allocations = { groups: Allocation[]; me: string }
