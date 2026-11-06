import { Loader2 } from 'lucide-react'

import { Button } from '../../../ui'
import { AgentIcon } from '../agent/AgentIcon'
import { agentOf } from '../agent/labels'
import { plural } from '../format'
import { Seconds } from '../ui/Seconds'
import type { Job } from '../useAssist'

const WORDS = {
  write: ['Writing your commit message', 'Keep working. It lands in History for you to check.'],
  check: ['Checking your list', 'Keep working. The results land in Notes, for you to decide.'],
  ask: ['Answering your question', 'Keep working. The answer shows under the lines it is about.'],
}
export function RunningCard({ job, onCancel }: { job: Job; onCancel: () => void }) {
  const [title, hint] = WORDS[job.kind]
  const a = job.about
  const covers = a?.files !== undefined ? `${plural(a.files, 'file')}, ${plural(a.lines ?? 0, 'line')}`
    : a?.notes !== undefined ? plural(a.notes, 'open note') : a?.title ?? ''
  return (
    <div role="status" className="menu-in pointer-events-auto rounded-xl border border-line bg-raised px-3.5 py-3
      shadow-[var(--shadow-dialog)]">
      <div className="flex items-center gap-2.5"><Loader2 size={15} className="animate-spin text-dim" />
        <b className="flex-1">{title}</b><span className="text-sm text-dim"><Seconds from={job.started} /></span></div>
      <div className="mt-1.5 ml-6 flex items-center gap-1.5 text-[12.5px] text-dim">
        <AgentIcon agent={agentOf(job.label)} size={11} />
        <span className="truncate">{[job.label, job.node && `node ${job.node}`, covers].filter(Boolean).join(' · ')}</span></div>
      <div className="mt-2.5 ml-6 flex items-center gap-2">
        <span className="flex-1 text-[12.5px] leading-[17px] text-dim">{job.stage === 'starting' || job.stage === 'preparing'
          ? 'Reading your changes.' : hint}</span>
        <Button size="sm" kind="ghost" onClick={onCancel}>Cancel</Button></div>
    </div>
  )
}
