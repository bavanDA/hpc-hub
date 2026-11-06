import { GitBranch } from 'lucide-react'

import type { Folder } from '../../types/backup'
import { Row } from '../e/Row'
import { CLASS } from './classes'
import { risk } from './copy'
import { count, gb, when } from './format'

export function FolderLine({ f }: { f: Folder }) {
  return (
    <Row label={<span className="flex items-center gap-2 font-mono text-sm">
        <span className="min-w-0 break-all">{f.path}</span>
        {f.git && <GitBranch size={14} aria-label="Git repository" className="shrink-0 text-dim" />}</span>}
      sub={[CLASS[f.kind], `${count(f.at_risk_files)} files`, gb(f.at_risk_bytes),
        f.soonest_days != null ? `goes ${when(f.soonest_days)}` : '', f.busy ? risk.busy : ''].filter(Boolean)
        .join(' · ')} />
  )
}
