// What the Jobs screen narrows and orders by: whose jobs, state chips, a search over the fields people type, and
// sort orders (the desktop's sortable columns, without columns). All of it lives in the filter sheet.
import { sortJobs, type SortKey } from '@shared/components/jobs/format'
import type { Job, Scope } from '@shared/types/jobs'
import { stateWord } from './words'

export const SCOPES = [['mine', 'Mine'], ['group', 'Group'], ['history', '7 days'], ['all', 'All']] as const
/** The line above the list: whose jobs it shows. */
export const SCOPE_TEXT: Record<Scope, string> = {
  mine: 'Your jobs', group: "Your group's jobs", history: 'Your last 7 days', all: "Everyone's jobs",
}

export const STATES = ['RUNNING', 'PENDING', 'COMPLETED', 'FAILED', 'CANCELLED', 'TIMEOUT']
export const STATE_CHIPS = STATES.map((s) => [s, stateWord(s)] as const)

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
export const stateOf = (j: Job) => j.state.split(' ')[0]

export function shownJobs(jobs: Job[], states: string[], query: string, order: Order): Job[] {
  const q = query.trim().toLowerCase()
  const kept = jobs.filter((j) => (!states.length || states.includes(stateOf(j))) &&
    (!q || [j.job_id, j.name, j.user, j.partition, j.reason].some((v) => v.toLowerCase().includes(q))))
  return sortJobs(kept, order.key, order.desc)
}

/** The wait reason without the "Waiting:" the state word already says: "Higher-priority jobs go first". */
export function reasonText(reason: string): string {
  const r = reason.replace(/^(waiting|pending)\s*:\s*/i, '')
  return r.charAt(0).toUpperCase() + r.slice(1)
}
