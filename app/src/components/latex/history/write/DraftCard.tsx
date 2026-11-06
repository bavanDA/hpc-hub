import { ArrowUp, Check, CircleAlert, RotateCcw, X } from 'lucide-react'
import { useState } from 'react'

import type { GitState, SavedVersion, Suggested, Written } from '../../../../types/history'
import { Button, Spinner } from '../../../ui'
import { AgentIcon } from '../agent/AgentIcon'
import { agentOf, shortLabel } from '../agent/labels'
import { clock, fileName, plural } from '../format'
import { Counts } from '../ui/Counts'
import { Segments } from '../ui/Segments'
import type { Assist, Job } from '../useAssist'
import { commitMessage, editedSince } from './draft'

type DraftProps = {
  assist: Assist
  draft: { job: Job; result: Written; n: number }
  state: GitState
  saved: SavedVersion[]
  headTime: number
  onCommit: (message: string, push: boolean) => Promise<boolean>
  onCommitSplit: (commits: { message: string; files: string[] }[], push: boolean) => Promise<boolean>
}
export function DraftCard({ assist, draft, state, saved, headTime, onCommit, onCommitSplit }: DraftProps) {
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
  const go = async (push: boolean) => {
    if (busy || rows.some((c) => !c.subject.trim())) return
    setBusy(push ? 'push' : 'commit')
    const ok = mode === 'one' ? await onCommit(commitMessage(one), push)
      : await onCommitSplit(parts.map((c) => ({ message: commitMessage(c), files: c.files })), push)
    setBusy('')
    if (ok) assist.clearDraft()
  }
  const set = (i: number, change: Partial<Suggested>) => mode === 'one' ? setOne({ ...one, ...change })
    : setParts(parts.map((c, k) => k === i ? { ...c, ...change } : c))
  const stat = (p: string) => state.changes.find((c) => c.path === p)
  const writing = assist.running('write') || assist.waitingFor === 'write'
  return (
    <div className="mt-3 max-w-[900px]">
      <div className="rounded-xl px-3.5 pt-2.5 pb-3 ring-1 ring-line-strong">
        <div className="flex items-center gap-2">
          <AgentIcon agent={agentOf(draft.job.label)} />
          <span className="min-w-0 flex-1 truncate"><b>{shortLabel(draft.job.label)}</b> <span className="text-dim">wrote this
            in {Math.max(1, draft.job.seconds)} s. Check it and edit it, then commit.</span></span>
          {split && <Segments small value={mode} onChange={setMode}
            options={[['one', 'One commit'], ['split', `${parts.length === 2 ? 'Two' : parts.length === 3 ? 'Three'
              : parts.length} commits`]]} />}
          <button onClick={assist.write} disabled={!!writing}
            className="flex h-7 items-center gap-1.5 rounded-md px-1.5 text-sm font-semibold hover:bg-hover disabled:opacity-50">
            <RotateCcw size={14} /> Write again</button>
          <button onClick={assist.clearDraft} aria-label="Put it away" title="Put it away"
            className="grid size-7 place-items-center rounded-md text-dim hover:bg-hover"><X size={14} /></button>
        </div>
        <div className="mt-2.5">
          {rows.map((c, i) => (
            <div key={i} className="flex items-start gap-3 border-t border-line py-2.5">
              {n > 1 && <span className="mt-2 grid size-[18px] shrink-0 place-items-center rounded-full bg-pill text-[11px]
                font-semibold">{i + 1}</span>}
              <div className="min-w-0 flex-1 rounded-lg bg-pill px-3 py-1.5 focus-within:ring-2 focus-within:ring-focus">
                <input value={c.subject} onChange={(e) => set(i, { subject: e.target.value })} aria-label="Summary"
                  className="w-full bg-transparent font-semibold outline-none" />
                <textarea value={c.body} onChange={(e) => set(i, { body: e.target.value })} aria-label="Why"
                  placeholder="Why (optional)" rows={Math.max(1, Math.min(4, c.body.split('\n').length))}
                  className="mt-0.5 block w-full resize-none bg-transparent text-[13px] leading-[18px] text-dim outline-none
                    placeholder:text-faint" />
              </div>
              <div className="flex w-[180px] shrink-0 flex-wrap gap-1 pt-1.5">
                {c.files.slice(0, 4).map((p) => (
                  <span key={p} title={p} className="flex h-6 items-center gap-1.5 rounded-md bg-pill px-1.5 font-mono text-xs">
                    {fileName(p)} {stat(p) && <Counts added={stat(p)!.added} removed={stat(p)!.removed} />}</span>
                ))}
                {c.files.length > 4 && <span className="text-xs text-dim">and {c.files.length - 4} more</span>}
              </div>
            </div>
          ))}
        </div>
        <div className="flex items-center gap-2 border-t border-line pt-2.5">
          <Button kind="primary" disabled={!!busy || rows.some((c) => !c.subject.trim())} onClick={() => void go(false)}>
            {busy === 'commit' ? <Spinner size={14} /> : <Check size={15} />} {n === 1 ? 'Commit' : n === 2 ? 'Commit both'
              : `Commit all ${n}`}</Button>
          <Button disabled={!!busy || !state.remotes.length || rows.some((c) => !c.subject.trim())}
            onClick={() => void go(true)} title={state.remotes.length ? 'Commit, then pull first and push' : 'This paper has no remote'}>
            {busy === 'push' ? <Spinner size={14} /> : <ArrowUp size={15} />} {n === 1 ? 'Commit and push'
              : n === 2 ? 'Commit both and push' : `Commit all ${n} and push`}</Button>
          <span className="flex-1" />
          <span className="text-right text-xs leading-4 text-dim">Nothing is committed until you press Commit.
            {covers.length > 0 && <><br />Covers {plural(covers.length, 'saved version')}{covers.length > 1
              ? `, ${clock(covers[0].time)} to ${clock(covers[covers.length - 1].time)}` : `, ${clock(covers[0].time)}`}.</>}</span>
        </div>
      </div>
      {edited.length > 0 && (
        <p className="mt-2.5 flex items-center gap-2 text-[12.5px] text-warn">
          <CircleAlert size={14} className="shrink-0" />
          <span>You edited {edited.slice(0, 2).map(fileName).join(' and ')}{edited.length > 2 ? ` and ${edited.length - 2} more`
            : ''} after it started. {mode === 'one' ? 'That edit is in the commit' : `That edit goes into commit ${within(edited[0]) + 1}`} but
            not in its message.</span>
          <button onClick={assist.write} disabled={!!writing} className="text-text underline underline-offset-2">Write again</button>
        </p>
      )}
    </div>
  )
}
