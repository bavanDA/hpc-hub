// What a node costs in SUs, worked out as you type from Slurm's billing weights (clusters.partitions billing),
// shared by the desktop's node window and the phone's. Checked against Wulver's own billing of real jobs.
import type { Billing, Profile } from '../../types/clusters'

/** SUs an hour for this size, before the priority's factor. */
export function suPerHour(b: Billing, p: Profile): number {
  const w = b.weights
  const cpu = p.cpus * (w.cpu ?? 1), mem = p.mem_gb * (w.mem ?? 0)
  const n = p.gpus ?? 0
  const gpu = n * ((w.gpu ?? 0) + (p.gpu_type ? w[`gpu:${p.gpu_type}`] ?? 0 : 0))
  if (b.max === 'all') return Math.max(cpu, mem, gpu)
  if (b.max === 'gres') return Math.max(cpu, mem) + gpu
  return cpu + mem + gpu
}

const round = (n: number) => (n >= 10 ? Math.round(n) : Math.round(n * 10) / 10)

/** "Up to 28 SU" and "7 SU an hour, only for the time it runs"; "Free" where the priority counts no SUs, with what
 *  a paid one would take. */
export function suText(b: Billing, p: Profile, minutes: number, qos: string): { value: string; sub: string } {
  const rate = suPerHour(b, p)
  if (!b.factor) {
    return { value: 'Free', sub: `No SUs with the ${qos || 'chosen'} priority. A paid one: ${round(rate)} SU an hour` }
  }
  const paid = rate * b.factor
  return { value: `Up to ${round((paid * minutes) / 60)} SU`, sub: `${round(paid)} SU an hour, only for the time it runs` }
}
