import type { Cluster } from '../../types'
import type { Account, Partition, StorageRow } from '../../types/usage'
import { n } from './format'

/** "Wulver (NJIT)" -> "Wulver" */
export const fullName = (c: Cluster) => c.name.split(' (')[0]

export const busiest = <T extends Account>(list: T[]): T | null =>
  list.reduce<T | null>((a, b) => (!a || b.used > a.used ? b : a), null)

/** 1463 of 2048 GB -> '1.4 of 2 TB'; small ones stay in GB. */
export function storageSize(r: StorageRow): string {
  const tb = (gb: number) => Number((gb / 1024).toFixed(1)).toString()
  if (!r.quota) return r.used >= 1000 ? `${tb(r.used)} TB used` : `${n(r.used)} GB used`
  return r.quota >= 1000 ? `${tb(r.used)} of ${tb(r.quota)} TB` : `${n(r.used)} of ${n(r.quota)} GB`
}

/** "general 94% busy, 102 waiting": the up queue with the most jobs waiting, or quiet when none wait. */
export function queueText(parts: Partition[]): string {
  const top = parts.filter((p) => p.up).reduce<Partition | null>((b, p) => (!b || p.pending > b.pending ? p : b), null)
  if (!top || !top.pending) return 'quiet'
  const busy = top.cpus_total ? `${Math.round((100 * top.cpus_used) / top.cpus_total)}% busy, ` : ''
  return `${top.name} ${busy}${n(top.pending)} waiting`
}

/** Scratch rows without a stated purge get -1: files go, but nobody said when. */
export const purgeDays = (r: StorageRow): number => r.purged ?? (/scratch/i.test(r.label) ? -1 : 0)
