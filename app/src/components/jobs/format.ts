// How jobs read: state colors, sort keys, and the SU line of your accounts.
import type { Job } from '../../types/jobs'
import type { Account } from '../../types/usage'

/** The phone's pill colors; the desktop uses StatusPill (ui.tsx statusKind), whose five kinds these follow. */
export const STATE_PILL: Record<string, string> = {
  RUNNING: 'bg-ok-bg text-ok', PENDING: 'bg-warn-bg text-warn', COMPLETING: 'bg-accent-soft text-accent-text',
  CANCELLED: 'bg-pill text-dim', COMPLETED: 'bg-pill text-dim',
  FAILED: 'bg-bad-bg text-bad', TIMEOUT: 'bg-bad-bg text-bad', OUT_OF_MEMORY: 'bg-bad-bg text-bad',
  NODE_FAIL: 'bg-bad-bg text-bad',
}

/** "Running", "Out of memory" for Slurm's RUNNING, OUT_OF_MEMORY. */
export const stateName = (s: string) => s.charAt(0) + s.slice(1).toLowerCase().replaceAll('_', ' ')

export const queue = (j: Job) => [j.partition, j.qos].filter(Boolean).join(' · ')

/** "16 GB" for Slurm's "16G", "500 MB" for "500M". */
export const memText = (mem: string) => mem.replace(/^(\d+(?:\.\d+)?)([KMGT])$/i, (_, n, u) => `${n} ${u.toUpperCase()}B`)

const idNumber = (j: Job) => parseInt(j.job_id, 10) || 0

export type SortKey = 'id' | 'name' | 'user' | 'queue' | 'state' | 'time' | 'res' | 'su' | 'where'
export const SORT: Record<SortKey, (j: Job) => string | number> = {
  id: idNumber, name: (j) => j.name.toLowerCase(), user: (j) => j.user, queue, state: (j) => j.state,
  time: (j) => j.seconds, res: (j) => parseInt(j.cpus, 10) || 0, su: (j) => j.su_spent, where: (j) => j.reason || j.where,
}

export function sortJobs(jobs: Job[], key: SortKey, desc: boolean): Job[] {
  const get = SORT[key]
  return [...jobs].sort((a, b) => {
    const x = get(a), y = get(b)
    const c = x < y ? -1 : x > y ? 1 : idNumber(b) - idNumber(a)
    return desc ? -c : c
  })
}

const n = (v: number) => v.toLocaleString('en-US')

/** "mygroup: 500 of 1,000 SU used (50%), yours 20", like the GTK footer. */
export function usageText(accounts: Account[]): string {
  const used = accounts.filter((a) => a.used || a.mine)
  return (used.length ? used : accounts.slice(0, 1)).map((a) => a.quota
    ? `${a.account}: ${n(a.used)} of ${n(a.quota)} SU used (${((100 * a.used) / a.quota).toFixed(1)}%), ` +
      `yours ${n(a.mine)}`
    : `${a.account}: ${n(a.used)} SU used${a.period ? ` in ${a.period}` : ''}, yours ${n(a.mine)}`).join(' · ')
}
