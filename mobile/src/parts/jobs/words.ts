// How a job reads on the phone: plain state words, "1 core", "64 GB", "Oct 24, 09:31", and Slurm's detail rows
// turned into those words (no State or Run time rows: the top of the sheet shows them).
import { priorityName } from '@shared/components/clusters/priority'
import { memText, stateName } from '@shared/components/jobs/format'
import type { DetailGroup } from '@shared/types/jobs'
import type { Tone } from '../../ui'

const WORDS: Record<string, string> = {
  PENDING: 'Waiting', TIMEOUT: 'Out of time', OUT_OF_MEMORY: 'Out of memory', NODE_FAIL: 'Node failed',
  PREEMPTED: 'Stopped for another job',
}

export const stateWord = (s: string) => WORDS[s.split(' ')[0]] ?? stateName(s.split(' ')[0])

export function stateTone(s: string): Tone {
  const st = s.split(' ')[0]
  if (st === 'RUNNING') return 'on'
  if (st === 'PENDING' || st === 'COMPLETING') return 'busy'
  if (['FAILED', 'TIMEOUT', 'OUT_OF_MEMORY', 'NODE_FAIL', 'BOOT_FAIL', 'DEADLINE'].includes(st)) return 'error'
  return 'off'
}

export const cores = (n: string | number) => `${n} ${Number(n) === 1 ? 'core' : 'cores'}`

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** "2026-10-24 09:31" -> "Oct 24, 09:31"; the year only when it isn't this one. */
export function dateText(v: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}:\d{2})/.exec(v)
  if (!m) return v
  const year = Number(m[1]) === new Date().getFullYear() ? '' : ` ${m[1]}`
  return `${MONTHS[Number(m[2]) - 1]} ${Number(m[3])}${year}, ${m[4]}`
}

const DROP = new Set(['State', 'Run time'])
const TITLES: Record<string, string> = { Status: '', Resources: 'Resources', Files: 'Files' }

/** Slurm's groups as the phone shows them. Labels it doesn't know pass through. */
export function phoneGroups(groups: DetailGroup[]): DetailGroup[] {
  return groups.map((g) => ({
    title: TITLES[g.title] ?? g.title,
    rows: g.rows.flatMap((r) => {
      if (DROP.has(r.label)) return []
      if (r.label === 'CPUs' || r.label === 'Cores') return [{ label: 'Cores', value: cores(r.value) }]
      if (r.label === 'Memory') return [{ label: 'Memory', value: memText(r.value) }]
      if (r.label === 'Partition · QoS · account') {
        const [queue, billing, group] = r.value.split(' · ')
        return [{ label: 'Queue', value: queue }, { label: 'Priority', value: billing && priorityName(billing) },
          { label: 'Group', value: group }]
          .filter((x) => x.value)
      }
      return [{ label: r.label, value: dateText(r.value) }]
    }),
  })).filter((g) => g.rows.length)
}
