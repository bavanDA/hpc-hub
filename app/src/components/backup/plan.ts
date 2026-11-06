import type { BackupPolicy, Folder, Plan, Summary } from '../../types/backup'
import type { Place } from '../../types/files'
import { risk } from './copy'

/** The space facts and the trial run state, worked out once for both screens. */
export function spaceFacts(plan: Plan, policy: BackupPolicy | null) {
  const s = plan.space
  const dest = policy?.destinations.find((d) => plan.dest.startsWith(d.path)) ?? policy?.destinations[0]
  const home = policy?.destinations.find((d) => d.backed_up && d !== dest && /home/i.test(d.label))
  const adds = Math.max(0, s.files_after - (dest?.files ?? s.files_after - plan.files))
  return {
    s, dest, adds,
    offerHome: !!dest && !dest.backed_up && !!home,
    tooManyFiles: s.file_limit > 0 && s.files_after > s.file_limit * 0.9,
    blocked: !s.fits,
    warn: s.fits && !!s.warn,
  }
}

/** True when path is in the cluster's scratch place (files.places labels it Scratch). */
export function inScratch(path: string, places: Place[]): boolean {
  return places.some((p) => /scratch/i.test(p.label) && (path === p.path || path.startsWith(`${p.path}/`)))
}

export type Group = { title: string; files: number; bytes: number; folders: Folder[] }

/** The deadlines in the summary, put in the groups the screen shows, with the folders that have files in each. */
export function groupsOf(s: Summary): Group[] {
  const out: Group[] = []
  let from = -Infinity
  for (const [upTo, title] of risk.groups) {
    const ds = s.deadlines.filter((d) => d.days > from && d.days <= upTo)
    const folders = s.folders.filter((f) => f.at_risk_files > 0 && f.soonest_days != null
      && f.soonest_days > from && f.soonest_days <= upTo)
    if (ds.length || folders.length) {
      out.push({ title, files: ds.reduce((n, d) => n + d.files, 0), bytes: ds.reduce((n, d) => n + d.bytes, 0),
        folders: folders.sort((a, b) => (a.soonest_days ?? 0) - (b.soonest_days ?? 0)) })
    }
    from = upTo
  }
  return out
}
