import { GitBranch } from 'lucide-react'

import type { Folder, Summary } from '../../types/backup'
import { Note } from '../e/extra'
import { Row, Section } from '../e/ui'
import { CLASS } from './classes'
import { risk } from './copy'
import { count, gb, when } from './format'
import { groupsOf } from './plan'

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
