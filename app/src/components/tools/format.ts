// Small helpers for the tool dialogs: dates, paths, the answers folder, what a profile sends.
import type { Profile } from '../../types/clusters'

/** Today 14:03, Yesterday 09:10, Mar 04 16:20, Mar 04 2024 */
export function when(ts: number): string {
  const t = new Date(ts * 1000)
  const day = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
  const days = Math.round((day(new Date()) - day(t)) / 86400000)
  const clock = t.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
  if (days <= 0) return `Today ${clock}`
  if (days === 1) return `Yesterday ${clock}`
  const date = t.toLocaleDateString('en-US', { month: 'short', day: '2-digit' })
  return days < 300 ? `${date} ${clock}` : `${date} ${t.getFullYear()}`
}

export const short = (path: string, home: string) =>
  home && (path === home || path.startsWith(home + '/')) ? '~' + path.slice(home.length) : path

/** Where a past chat ran, said against the Folder above it: nothing when it's that folder, "src" inside it, else
 *  the path with ~ for home. */
export function chatPlace(cwd: string, folder: string, home: string): string {
  const at = short(cwd, home), f = folder.trim().replace(/\/+$/, '') || '~'
  return at === f ? '' : at.startsWith(`${f}/`) ? at.slice(f.length + 1) : at
}

const two = (n: number) => String(n).padStart(2, '0')

/** <folder>/.hpc-hub/ask/20261024-1405 */
export function answersFolder(folder: string) {
  const d = new Date()
  const day = `${d.getFullYear()}${two(d.getMonth() + 1)}${two(d.getDate())}`
  const stamp = `${day}-${two(d.getHours())}${two(d.getMinutes())}`
  return `${folder.trim().replace(/\/+$/, '') || '~'}/.hpc-hub/ask/${stamp}`
}

/** What goes to the backend: the fields Slurm gets (extra arguments stay in the settings). */
export const sendable = (p: Profile) => ({ cpus: p.cpus, mem_gb: p.mem_gb, gpus: p.gpus ?? 0, time: p.time,
  partition: p.partition.trim(), account: (p.account ?? '').trim(), qos: (p.qos ?? '').trim() })
