// How jobs read: state names, memory, sort keys, and the SU line of your accounts.
import type { Job } from '../../types/jobs'
import type { Account } from '../../types/usage'

/** "Running", "Out of memory" for Slurm's RUNNING, OUT_OF_MEMORY. */
const WORDS: Record<string, string> = {
  PENDING: 'Waiting', TIMEOUT: 'Out of time', OUT_OF_MEMORY: 'Out of memory', NODE_FAIL: 'Node failed',
  PREEMPTED: 'Stopped for another job',
}
export const stateName = (s: string) => WORDS[s] ?? s.charAt(0) + s.slice(1).toLowerCase().replaceAll('_', ' ')

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

/** "mygroup: 500 hours left (SU) of 1,000, you used 20". "SU" is said once, in brackets. */
export function usageText(accounts: Account[]): string {
  const used = accounts.filter((a) => a.used || a.mine)
  return (used.length ? used : accounts.slice(0, 1)).map((a, i) => {
    const su = i ? '' : ' (SU)'
    return a.quota
      ? `${a.account}: ${n(Math.max(0, a.quota - a.used))} hours left${su} of ${n(a.quota)}, you used ${n(a.mine)}`
      : `${a.account}: ${n(a.used)} hours used${su}${a.period ? ` in ${a.period}` : ''}, you used ${n(a.mine)}`
  }).join(' · ')
}
