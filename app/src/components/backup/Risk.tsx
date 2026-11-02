// What the check found: the headline, files grouped by when they go, folder by folder, and the notes about how days
// are counted. Shared by the desktop page and the phone screen (both render it, the phone in one column).
import { CircleAlert, GitBranch } from 'lucide-react'

import type { Folder, Summary } from '../../types/backup'
import { Pill } from '../ui'
import { CLASS, count, gb, risk, when } from './copy'

type Group = { title: string; files: number; bytes: number; folders: Folder[] }

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

export function FolderLine({ f }: { f: Folder }) {
  return (
    <div className="flex min-h-12 items-center gap-3 px-4 py-2">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate font-mono text-sm">{f.path}</span>
          {f.git && <GitBranch size={14} className="shrink-0 text-dim" aria-label="Git repository" />}
          {f.busy && <Pill kind="info">Busy</Pill>}
        </div>
        <div className="truncate text-sm text-dim">
          {CLASS[f.kind]} · {count(f.at_risk_files)} files · {gb(f.at_risk_bytes)}
          {f.soonest_days != null ? ` · goes ${when(f.soonest_days)}` : ''}
        </div>
        {f.busy && <div className="text-sm text-dim">{risk.busy}</div>}
      </div>
    </div>
  )
}

export function RiskHead({ s }: { s: Summary }) {
  const folders = s.folders.filter((f) => f.at_risk_files > 0).length
  return (
    <div className="flex flex-col gap-1">
      <h2 className="text-xl font-semibold">{risk.headline(s.at_risk_files, s.horizon_days)}</h2>
      {s.at_risk_files > 0 && <p className="text-md text-dim">{risk.sub(s.at_risk_bytes, folders, s.soonest_days)}</p>}
    </div>
  )
}

export function RiskNotes({ s, name }: { s: Summary; name: string }) {
  const full = s.purge.sooner_when_full_pct && s.scratch_fill_pct >= s.purge.sooner_when_full_pct - 10
  return (
    <div className="flex flex-col gap-2">
      {full ? (
        <p className="flex items-start gap-2 rounded-lg bg-warn-bg p-3 text-sm text-warn">
          <CircleAlert size={16} className="mt-0.5 shrink-0" />{risk.full(s.scratch_fill_pct, name, s.purge.days)}
        </p>
      ) : null}
      {s.partial && <p className="flex items-start gap-2 rounded-lg bg-warn-bg p-3 text-sm text-warn">
        <CircleAlert size={16} className="mt-0.5 shrink-0" />{risk.partial}</p>}
    </div>
  )
}
