// What the check found: the headline, files grouped by when they go, folder by folder, and what to know about the
// numbers. groupsOf is shared with the phone; the rows are the desktop's, in style E like the phone's RiskView.
import { GitBranch } from 'lucide-react'

import type { Folder, Summary } from '../../types/backup'
import { Note } from '../e/extra'
import { Row, Section } from '../e/ui'
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

function FolderLine({ f }: { f: Folder }) {
  return (
    <Row label={<span className="flex items-center gap-2 font-mono text-sm">
        <span className="min-w-0 break-all">{f.path}</span>
        {f.git && <GitBranch size={14} aria-label="Git repository" className="shrink-0 text-dim" />}</span>}
      sub={[CLASS[f.kind], `${count(f.at_risk_files)} files`, gb(f.at_risk_bytes),
        f.soonest_days != null ? `goes ${when(f.soonest_days)}` : '', f.busy ? risk.busy : ''].filter(Boolean)
        .join(' · ')} />
  )
}

export function RiskView({ s, name }: { s: Summary; name: string }) {
  const folders = s.folders.filter((f) => f.at_risk_files > 0).length
  const full = s.purge.sooner_when_full_pct && s.scratch_fill_pct >= s.purge.sooner_when_full_pct - 10
  return (
    <>
      <div className="px-5">
        <h2 className="text-xl font-semibold">{risk.headline(s.at_risk_files, s.horizon_days)}</h2>
        <p className="mt-1 text-md text-dim">{s.at_risk_files > 0 ? risk.sub(s.at_risk_bytes, folders, s.soonest_days)
          : risk.nothing}</p>
      </div>
      {full ? <Note>{risk.full(s.scratch_fill_pct, name, s.purge.days)}</Note> : null}
      {s.partial && <Note>{risk.partial}</Note>}
      {groupsOf(s).map((g) => (
        <Section key={g.title} title={`${g.title} · ${count(g.files)} files, ${gb(g.bytes)}`}>
          {g.folders.map((f) => <FolderLine key={f.path} f={f} />)}
        </Section>
      ))}
    </>
  )
}
