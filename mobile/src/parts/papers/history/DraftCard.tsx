// The message the agent wrote: check it, edit it, then commit (or split it into the commits it suggests). The
// desktop's DraftCard, stacked for a phone. Nothing is committed until you press Commit.
import { ArrowUp, Check, CircleAlert, RotateCcw, X } from 'lucide-react'
import { useState } from 'react'

import { AgentIcon } from '@shared/components/latex/history/agent/AgentIcon'
import { agentOf, shortLabel } from '@shared/components/latex/history/agent/labels'
import { clock, fileName, plural } from '@shared/components/latex/history/format'
import { Counts } from '@shared/components/latex/history/ui/Counts'
import { commitMessage, editedSince } from '@shared/components/latex/history/write/draft'
import type { Assist, Job } from '@shared/components/latex/history/useAssist'
import { Spinner } from '@shared/components/ui/Spinner'
import type { GitState, SavedVersion, Suggested, Written } from '@shared/types/history'
import { Button, Segments } from '../../../ui'

export function DraftCard({ assist, draft, state, saved, headTime, onCommit, onCommitSplit }: {
  assist: Assist; draft: { job: Job; result: Written; n: number }; state: GitState; saved: SavedVersion[]; headTime: number
  onCommit: (message: string, push: boolean) => Promise<boolean>
  onCommitSplit: (commits: { message: string; files: string[] }[], push: boolean) => Promise<boolean>
}) {
  const r = draft.result
  const split = r.commits.length > 1
  const [mode, setMode] = useState<'one' | 'split'>(split ? 'split' : 'one')
  const [one, setOne] = useState<Suggested>({ subject: r.subject, body: r.body, files: state.changes.map((c) => c.path) })
  const [parts, setParts] = useState<Suggested[]>(r.commits)
  const [busy, setBusy] = useState<'' | 'commit' | 'push'>('')
  const rows = mode === 'split' ? parts : [one]
  const edited = editedSince(r.files, state.changes)
  const within = (p: string) => { const i = parts.findIndex((c) => c.files.includes(p)); return i < 0 ? parts.length - 1 : i }
  const covers = saved.filter((v) => v.time > headTime).sort((a, b) => a.time - b.time)
  const n = rows.length
  const blocked = rows.some((c) => !c.subject.trim())
  const go = async (push: boolean) => {
    if (busy || blocked) return
    setBusy(push ? 'push' : 'commit')
    const ok = mode === 'one' ? await onCommit(commitMessage(one), push)
      : await onCommitSplit(parts.map((c) => ({ message: commitMessage(c), files: c.files })), push)
    setBusy('')
    if (ok) assist.clearDraft()
  }
  const set = (i: number, change: Partial<Suggested>) => mode === 'one' ? setOne({ ...one, ...change })
    : setParts(parts.map((c, k) => k === i ? { ...c, ...change } : c))
  const stat = (p: string) => state.changes.find((c) => c.path === p)
  const writing = !!assist.running('write') || assist.waitingFor === 'write'
  return (
    <div className="rounded-xl px-3 pt-2.5 pb-3 ring-1 ring-line-strong">
      <div className="flex items-start gap-2">
        <AgentIcon agent={agentOf(draft.job.label)} />
        <span className="min-w-0 flex-1 text-sm"><b>{shortLabel(draft.job.label)}</b> <span className="text-dim">wrote this
          in {Math.max(1, draft.job.seconds)} s. Check it and edit it, then commit.</span></span>
        <button onClick={assist.clearDraft} aria-label="Put it away"
          className="grid size-7 shrink-0 place-items-center rounded-md text-dim active:bg-pressed"><X size={14} /></button>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        {split && <Segments fit value={mode} onChange={setMode} options={[['one', 'One commit'],
          ['split', `${parts.length === 2 ? 'Two' : parts.length === 3 ? 'Three' : parts.length} commits`]]} />}
        <Button small kind="quiet" icon={RotateCcw} disabled={writing} onClick={assist.write} className="ml-auto">Write again</Button>
      </div>
      <div className="mt-2">
        {rows.map((c, i) => (
          <div key={i} className="border-t border-line py-2.5">
            {n > 1 && <span className="mb-1 grid size-[18px] place-items-center rounded-full bg-pill text-[11px] font-semibold">{i + 1}</span>}
            <div className="rounded-lg bg-soft px-3 py-1.5 focus-within:ring-1 focus-within:ring-accent">
              <input value={c.subject} onChange={(e) => set(i, { subject: e.target.value })} aria-label="Summary"
                className="w-full bg-transparent font-semibold outline-none" />
              <textarea value={c.body} onChange={(e) => set(i, { body: e.target.value })} aria-label="Why" placeholder="Why (optional)"
                rows={Math.max(1, Math.min(4, c.body.split('\n').length))}
                className="mt-0.5 block w-full resize-none bg-transparent text-sm text-dim outline-none placeholder:text-faint" />
            </div>
            <div className="mt-1.5 flex flex-wrap gap-1">
              {c.files.slice(0, 4).map((p) => (
                <span key={p} className="flex h-6 items-center gap-1.5 rounded-md bg-pill px-1.5 font-mono text-xs">
                  {fileName(p)} {stat(p) && <Counts added={stat(p)!.added} removed={stat(p)!.removed} />}</span>
              ))}
              {c.files.length > 4 && <span className="self-center text-xs text-dim">and {c.files.length - 4} more</span>}
            </div>
          </div>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-2 border-t border-line pt-2.5">
        <Button kind="primary" disabled={!!busy || blocked} onClick={() => void go(false)}>
          {busy === 'commit' ? <Spinner size={16} /> : <Check size={16} />} {n === 1 ? 'Commit' : n === 2 ? 'Commit both' : `Commit all ${n}`}</Button>
        <Button kind="quiet" disabled={!!busy || !state.remotes.length || blocked} onClick={() => void go(true)}>
          {busy === 'push' ? <Spinner size={16} /> : <ArrowUp size={16} />} {n === 1 ? 'Commit and push' : n === 2 ? 'Commit both and push' : `Commit all ${n} and push`}</Button>
      </div>
      <p className="mt-2 text-xs text-dim">Nothing is committed until you press Commit.{covers.length > 0 && <> Covers {plural(covers.length, 'saved version')}{covers.length > 1
        ? `, ${clock(covers[0].time)} to ${clock(covers[covers.length - 1].time)}` : `, ${clock(covers[0].time)}`}.</>}</p>
      {edited.length > 0 && (
        <p className="mt-2 flex items-start gap-2 text-[12.5px] text-warn">
          <CircleAlert size={14} className="mt-0.5 shrink-0" />
          <span className="min-w-0 flex-1">You edited {edited.slice(0, 2).map(fileName).join(' and ')}{edited.length > 2 ? ` and ${edited.length - 2} more` : ''} after it started.
            {' '}{mode === 'one' ? 'That edit is in the commit' : `That edit goes into commit ${within(edited[0]) + 1}`} but not in its message.
            {' '}<button onClick={assist.write} disabled={writing} className="text-text underline underline-offset-2">Write again</button></span>
        </p>
      )}
    </div>
  )
}
