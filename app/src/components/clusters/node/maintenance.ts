import type { Maintenance } from '../../../types/clusters'

const MARGIN = 10  // minutes: the job still has to start, and Slurm wants it finished before maintenance

/** The time to ask for so a job started now ends before maintenance, in whole 5 minutes; 0: too close for any job. */
export const shortened = (left: number) => Math.max(Math.floor((left - MARGIN) / 5) * 5, 0)

/** Whether a job of this many minutes can't start now and finish in time. */
export const runsInto = (m: Maintenance, asked: number) => m.active || asked > shortened(m.minutes_left)

/** '2026-11-10T07:50:00' and 'EST' -> 'Tue, Nov 10 at 7:50 AM EST'. Read as written: it is already the cluster's clock. */
export function whenText(m: Maintenance): string {
  const d = new Date(m.start)
  const day = d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
  return `${day} at ${d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })} ${m.tz}`.trim()
}
