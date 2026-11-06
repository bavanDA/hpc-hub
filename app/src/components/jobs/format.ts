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
const SORT: Record<SortKey, (j: Job) => string | number> = {
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

/** The wait reason without the "Waiting:" the state column already says: "Higher-priority jobs go first". */
export function reasonText(reason: string): string {
  const r = reason.replace(/^(waiting|pending)\s*:\s*/i, '')
  return r.charAt(0).toUpperCase() + r.slice(1)
}

/** "3 h 41 min" for Slurm's "3:41:10", "1 d 2 h" for "1-02:00:00", "12 min" for "12:30". */
export function ranFor(t: string): string {
  const [d, hms] = t.includes('-') ? t.split('-') : ['0', t]
  const p = hms.split(':').map((x) => Number(x) || 0)
  const [h, m] = p.length === 3 ? [p[0], p[1]] : [0, p[0]]
  const days = Number(d) || 0
  return days ? `${days} d${h ? ` ${h} h` : ''}` : h ? `${h} h${m ? ` ${m} min` : ''}` : `${m || 1} min`
}

/** How much of its time limit a job used, 0 to 1; a timed out job used all of it. */
export const timeShare = (j: Job) => (j.state === 'TIMEOUT' ? 1 : j.limit_seconds ? j.seconds / j.limit_seconds : 0)

/** "a, b and 2 more." past six names. */
export const nameList = (names: string[], max = 6) =>
  names.length > max ? `${names.slice(0, max).join(', ')} and ${names.length - max} more.` : `${names.join(', ')}.`

/** Jobs in this state (or any) whose id, name, person, queue or reason holds the query. */
export function filterJobs(jobs: Job[], state: string, query: string): Job[] {
  const q = query.trim().toLowerCase()
  return jobs.filter((j) => (!state || j.state === state) &&
    (!q || [j.job_id, j.name, j.user, j.partition, j.reason].some((v) => v.toLowerCase().includes(q))))
}
