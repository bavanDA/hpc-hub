import { Copy, CornerDownRight, Loader2, StickyNote, X } from 'lucide-react'

import type { Answer } from '../../../../types/history'
import { useToast } from '../../../toast'
import { AgentIcon } from '../agent/AgentIcon'
import { agentOf, shortLabel } from '../agent/labels'
import { lastLine, when } from '../format'
import type { Go } from '../go'
import { Seconds } from '../ui/Seconds'
import type { Job } from '../useAssist'
import { AnswerText } from './AnswerText'
import { plainCites } from './cite'

type ThreadProps = {
  job: Job
  go: Go
  here?: string
  onNote: (text: string) => void
  onMore: () => void
  onCancel: () => void
  onClose: () => void
  className?: string
}

/** One question and its answer, under the lines it is about. */
export function Thread({ job, go, here, onNote, onMore, onCancel, onClose, className = 'mx-12 my-2' }: ThreadProps) {
  const toast = useToast()
  const a = job.result as Answer | undefined
  const runningNow = ['starting', 'preparing', 'running'].includes(job.stage)
  const agent = shortLabel(job.label)
  return (
    <div className={`${className} rounded-xl border border-line bg-raised px-3.5 pt-2.5 pb-2 font-sans text-base shadow-sm
      select-text`}>
      <div className="flex items-center gap-2 text-sm">
        <span className="size-[18px] rounded-full border border-dashed border-line-strong" />
        <b>You</b> <span className="min-w-0 flex-1 truncate text-dim">asked about {job.ask?.title} · {when(job.started / 1000)}</span>
        {!runningNow && <button onClick={onClose} aria-label="Close" title="Close"
          className="grid size-7 place-items-center rounded-md text-dim hover:bg-hover"><X size={14} /></button>}
      </div>
      <p className="mt-1 ml-[26px]">{job.ask?.question}</p>
      <div className="mt-2.5 ml-[26px] flex items-center gap-2 text-sm">
        <AgentIcon agent={agentOf(job.label)} />
        <b>{agent}</b>
        <span className="text-dim">{runningNow ? <><Loader2 size={12} className="mr-1 inline animate-spin" />
          is answering{job.node ? ` on ${job.node}` : ''}, <Seconds from={job.started} /></>
          : job.stage === 'done' ? `answered in ${Math.max(1, Math.round(job.seconds))} s`
          : job.stage === 'cancelled' ? 'stopped' : 'could not answer'}</span>
        {runningNow && <button onClick={onCancel} className="ml-auto rounded-md px-2 py-1 text-sm font-semibold hover:bg-hover">
          Cancel</button>}
      </div>
      {job.stage === 'failed' && <p className="mt-1 ml-[52px] text-bad">{lastLine(job.error)}</p>}
      {a && job.stage === 'done' && <>
        <p className="mt-1 ml-[52px] leading-6"><AnswerText text={a.text} here={here} go={go} /></p>
        <div className="mt-2 ml-[46px] flex gap-1">
          <button onClick={() => onNote(plainCites(a.text))}
            className="flex h-8 items-center gap-1.5 rounded-md px-2 text-sm font-semibold hover:bg-hover">
            <StickyNote size={14} /> Add as a note</button>
          <button onClick={onMore} className="flex h-8 items-center gap-1.5 rounded-md px-2 text-sm font-semibold hover:bg-hover">
            <CornerDownRight size={14} /> Ask more</button>
          <button onClick={() => navigator.clipboard.writeText(a.text).then(() => toast('Answer copied'))
            .catch(() => toast('Could not copy'))}
            className="flex h-8 items-center gap-1.5 rounded-md px-2 text-sm font-semibold hover:bg-hover">
            <Copy size={14} /> Copy</button>
        </div>
      </>}
    </div>
  )
}
