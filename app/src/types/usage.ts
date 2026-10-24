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
