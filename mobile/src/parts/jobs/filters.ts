// What the Jobs screen narrows and orders by: state chips, a search over the fields people type, and sort orders as
// an action sheet (the desktop's sortable columns, without columns).
import { sortJobs, stateName, type SortKey } from '@shared/components/jobs/format'
import type { Job } from '@shared/types/jobs'

export const STATES = ['RUNNING', 'PENDING', 'COMPLETED', 'FAILED', 'CANCELLED', 'TIMEOUT']
export const STATE_CHIPS = STATES.map((s) => [s, stateName(s)] as const)

export type Order = { key: SortKey; desc: boolean; label: string }
export const ORDERS: Order[] = [
  { key: 'id', desc: true, label: 'Newest first' },
  { key: 'id', desc: false, label: 'Oldest first' },
  { key: 'name', desc: false, label: 'Name' },
  { key: 'state', desc: false, label: 'State' },
  { key: 'time', desc: true, label: 'Most time used' },
  { key: 'res', desc: true, label: 'Most cores' },
  { key: 'su', desc: true, label: 'Most SU' },
]

/** CANCELLED shows as "CANCELLED by 123" in some Slurm versions: the first word is the state. */
const stateOf = (j: Job) => j.state.split(' ')[0]

export function shownJobs(jobs: Job[], states: string[], query: string, order: Order): Job[] {
  const q = query.trim().toLowerCase()
  const kept = jobs.filter((j) => (!states.length || states.includes(stateOf(j))) &&
    (!q || [j.job_id, j.name, j.user, j.partition, j.reason].some((v) => v.toLowerCase().includes(q))))
  return sortJobs(kept, order.key, order.desc)
}
