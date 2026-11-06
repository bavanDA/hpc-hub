import { cores } from '../../types/clusters'
import { gpuAmount } from '../clusters/gpus'
import type { Compute, ScheduleStatus } from '../../types/schedules'

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const two = (n: number) => String(n).padStart(2, '0')
const stamp = (d: Date) => `${MONTHS[d.getMonth()]} ${d.getDate()} ${two(d.getHours())}:${two(d.getMinutes())}`

/** 2026-10-20T02:00:00 (cluster time, as Slurm says it) -> Oct 20 02:00 */
export function slurmWhen(text: string): string {
  const m = /^(\d{4})-(\d\d)-(\d\d)T(\d\d):(\d\d)/.exec(text)
  return m ? `${MONTHS[parseInt(m[2], 10) - 1]} ${parseInt(m[3], 10)} ${m[4]}:${m[5]}` : text
}

/** Seconds since 1970 -> Oct 20 02:00 on this computer's clock. */
export const localWhen = (seconds: number) => stamp(new Date(seconds * 1000))

export type Kind = 'ok' | 'warn' | 'dim'

export function status(st: ScheduleStatus): { kind: Kind; label: string; note: string } {
  if (st.state === 'RUNNING') return { kind: 'ok', label: 'Running', note: 'Running now' }
  if (!st.enabled) return { kind: 'dim', label: 'Paused', note: '' }
  if (st.state === 'PENDING') return { kind: 'dim', label: 'Waiting', note: `Next ${slurmWhen(st.start)}` }
  return { kind: 'warn', label: 'Not queued', note: 'Edit it and save to queue it' }
}

export function computeText(c: Compute, cluster = ''): string {
  return [c.cpus ? cores(c.cpus) : '', c.mem_gb ? `${c.mem_gb} GB` : '',
    c.gpus ? gpuAmount(c.gpus, c.gpu_type, cluster) : ''].filter(Boolean).join(' · ')
}
