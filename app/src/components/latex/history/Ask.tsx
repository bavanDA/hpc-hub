// Ask the agent about a change: the box (a question, and for this one question another agent if you like) and the
// thread that shows the answer right under the lines it is about, with links to the lines and PDF pages it cites.
// It runs in the background like Write message: you keep reading.
import { ArrowUp, Copy, CornerDownRight, Loader2, StickyNote, X } from 'lucide-react'
import { Fragment, useEffect, useState, type ReactNode } from 'react'

import type { AgentChoice, AgentPick, Answer } from '../../../types/history'
import { useToast } from '../../toast'
import { Button } from '../../ui'
import { AgentIcon, PickMenu } from './Agent'
import { fileName, lastLine, when } from './bits'
import { chipLabel, shortLabel, type Job } from './useAssist'

/** [[path:line]], [[path:first-last]], [[page N]] (hpc_hub/latex/assist.py CITE_RE). */
const CITE = /\[\[\s*(?:(?:page|p\.)\s*(\d+)|([^[\]\n:]+?):(\d+)(?:\s*[-–]\s*(\d+))?)\s*\]\]/gi

export type Go = { line: (path: string, line: number) => void; page: (page: number) => void }

/** The answer, its cited lines and pages as links. here: the file the question was about (its lines say "line 30"). */
export function AnswerText({ text, here, go }: { text: string; here?: string; go: Go }) {
  const out: ReactNode[] = []
  let at = 0
  for (const m of text.matchAll(CITE)) {
    out.push(<Fragment key={at}>{text.slice(at, m.index)}</Fragment>)
    const [, page, path, line, end] = m
    const p = path?.trim() ?? ''
    const label = page ? `page ${page}` : `${p === here ? 'line' : `${fileName(p)} line`}${end && end !== line
      ? `s ${line} to ${end}` : ` ${line}`}`
    out.push(<button key={`l${m.index}`} onClick={() => page ? go.page(Number(page)) : go.line(p, Number(line))}
      className="underline decoration-dim underline-offset-2 hover:decoration-text">{label}</button>)
    at = (m.index ?? 0) + m[0].length
  }
  out.push(<Fragment key="end">{text.slice(at)}</Fragment>)
  return <span className="whitespace-pre-line">{out}</span>
}

type BoxProps = {
  title: ReactNode  // Ask about the selected text "…"
  choice: AgentChoice | null
  initial?: string
  onAsk: (question: string, pick: AgentPick | null) => void
  onClose: () => void
  className?: string
}

export function AskBox({ title, choice, initial = '', onAsk, onClose, className = 'mx-12 my-2' }: BoxProps) {
  const [q, setQ] = useState(initial)
  const [pick, setPick] = useState<AgentPick | null>(null)
  const go = () => { if (q.trim()) onAsk(q.trim(), pick) }
  return (
    <div className={`${className} rounded-xl border-2 border-text bg-window px-3.5 pt-2.5 pb-2 font-sans text-base select-none`}>
      <div className="flex items-center gap-2 text-sm">
        <span className="size-[18px] rounded-full border border-dashed border-line-strong" />
        <span className="min-w-0 flex-1 truncate"><b>Ask about</b> <span className="text-dim">{title}</span></span>
        <button onClick={onClose} aria-label="Close" className="grid size-7 place-items-center rounded-md text-dim hover:bg-hover">
          <X size={14} /></button>
      </div>
      <div className="mt-2 flex items-center gap-2">
        <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Ask about this change"
          aria-label="Your question" onKeyDown={(e) => { if (e.key === 'Enter') go(); if (e.key === 'Escape') onClose() }}
          className="h-9 min-w-0 flex-1 rounded-lg border border-line-strong bg-window px-3 outline-none
            placeholder:text-faint focus:border-accent focus:ring-1 focus:ring-accent" />
        {choice && <PickMenu choice={choice} value={pick} onPick={setPick} />}
        <Button kind="primary" disabled={!q.trim()} onClick={go}><ArrowUp size={15} /> Ask</Button>
      </div>
      <p className="mt-1.5 text-xs text-dim">Answers appear here while you keep reading.{pick && choice
        ? ` This ask uses ${chipLabel(pick, choice.agents)}; your usual choice stays ${chipLabel(choice, choice.agents)}.` : ''}</p>
    </div>
  )
}

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
        <AgentIcon agent={job.label.startsWith('ChatGPT') ? 'codex' : job.label.startsWith('Cursor') ? 'cursor'
          : job.label.startsWith('Antigravity') ? 'agy' : 'claude'} />
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
          <button onClick={() => onNote(a.text.replace(CITE, (_, pg, p, l) => pg ? `page ${pg}` : `${fileName(p)} line ${l}`))}
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

export function Seconds({ from }: { from: number }) {
  const [, tick] = useState(0)
  useEffect(() => { const t = setInterval(() => tick((n) => n + 1), 1000); return () => clearInterval(t) }, [])
  return <span className="tabular-nums">{Math.max(0, Math.floor((Date.now() - from) / 1000))} s</span>
}
