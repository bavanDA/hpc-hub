// Notes on the phone, the desktop's panel as a page: to-dos and comments kept next to the paper in .git, Check my list
// compares them with your changes, and you decide each one.
import { Check, CircleHelp, ListChecks, MapPin, Plus, Trash2, X } from 'lucide-react'
import { useEffect, useState, type ReactNode } from 'react'

import { AgentIcon } from '@shared/components/latex/history/agent/AgentIcon'
import { agentOf, shortLabel } from '@shared/components/latex/history/agent/labels'
import { AnswerText } from '@shared/components/latex/history/ask/AnswerText'
import { fileName, plural, shortHash, when } from '@shared/components/latex/history/format'
import type { Go } from '@shared/components/latex/history/go'
import { isLine, isPage } from '@shared/components/latex/history/notes/places'
import { Seconds } from '@shared/components/latex/history/ui/Seconds'
import type { Assist } from '@shared/components/latex/history/useAssist'
import { Spinner } from '@shared/components/ui/Spinner'
import type { Note, NotePlace, Verdict } from '@shared/types/history'
import { Button, Segments, Switch } from '../../../ui'

const VERDICT: Record<Verdict['verdict'], [ReactNode, string, string]> = {
  done: [<Check key="d" size={11} />, 'Looks done', 'bg-[rgb(26_127_55/0.12)] text-[var(--diff-add-ink)]'],
  not_yet: [<X key="n" size={11} />, 'Not yet', 'bg-[rgb(207_34_46/0.10)] text-[var(--diff-del-ink)]'],
  unsure: [<CircleHelp key="u" size={11} />, 'Unsure', 'bg-pill text-dim'],
}

function place(p: NotePlace | null) {
  if (!p) return 'To-do'
  if (isLine(p)) return `${fileName(p.path)}, line ${p.line}`
  return isPage(p) ? `p. ${p.page}` : shortHash((p as { hash: string }).hash)
}

export function NotesList({ assist, focus, go }: { assist: Assist; focus: string
  go: Go & { place: (p: NotePlace) => void } }) {
  const [view, setView] = useState<'open' | 'done' | 'all'>('open')
  const [showDone, setShowDone] = useState(true)
  const [adding, setAdding] = useState(false)
  const [text, setText] = useState('')
  const [kept, setKept] = useState<Set<string>>(new Set())  // verdicts you answered with Keep open
  useEffect(() => {
    if (focus) document.querySelector(`[data-note-row="${CSS.escape(focus)}"]`)?.scrollIntoView({ block: 'center' })
  }, [focus])
  const all = assist.notes?.notes ?? []
  const open = all.filter((n) => !n.done), done = all.filter((n) => n.done)
  const checked = assist.checked
  const verdicts = new Map((checked?.result.results ?? []).filter((v) => !kept.has(v.id)).map((v) => [v.id, v]))
  const job = assist.running('check')
  const waiting = assist.waitingFor === 'check'
  const list = view === 'open' ? open : view === 'done' ? done : all
  const counts = checked && ['done', 'not_yet', 'unsure'].map((k) => checked.result.results.filter((v) => v.verdict === k).length)
  const add = async () => {
    if (!text.trim()) return
    if (await assist.addNote(text.trim())) { setText(''); setAdding(false) }
  }
  const row = (n: Note) => {
    const v = n.done ? undefined : verdicts.get(n.id)
    return (
      <div key={n.id} data-note-row={n.id} className={`flex gap-2.5 border-b border-line px-4 py-2.5 ${v ? 'bg-inset' : ''}
        ${focus === n.id ? 'ring-2 ring-focus ring-inset' : ''}`}>
        <input type="checkbox" checked={n.done} onChange={(e) => void assist.setNote(n.id, { done: e.target.checked })}
          aria-label={n.done ? 'Open again' : 'Check off'} className="mt-0.5 size-[18px] shrink-0 accent-[var(--color-text)]" />
        <div className="min-w-0 flex-1">
          <p className={`break-words ${n.done ? 'text-dim line-through' : ''}`}>{n.text}</p>
          <div className="mt-1 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-xs text-dim">
            {n.place ? <button onClick={() => go.place(n.place!)} className="flex items-center gap-1 rounded bg-pill px-1.5 py-px">
              <MapPin size={11} /> {place(n.place)}</button>
              : <span className="rounded bg-pill px-1.5 py-px">To-do</span>}
            <span className="whitespace-nowrap">{n.author === assist.notes?.user ? 'You' : n.author} · {when(n.time)}</span>
          </div>
          {v && <>
            <div className="mt-1.5 flex items-start gap-1.5 text-[12.5px]">
              <span className={`flex h-5 shrink-0 items-center gap-1 rounded px-1.5 font-semibold ${VERDICT[v.verdict][2]}`}>
                {VERDICT[v.verdict][0]} {VERDICT[v.verdict][1]}</span>
              <span className="text-dim"><AnswerText text={v.reason} go={go} /></span>
            </div>
            {v.verdict === 'done' && <div className="mt-2 flex gap-1.5">
              <Button small kind="primary" icon={Check} onClick={() => void assist.setNote(n.id, { done: true })}>Check off</Button>
              <Button small kind="quiet" onClick={() => setKept(new Set([...kept, n.id]))}>Keep open</Button>
            </div>}
          </>}
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          {n.place && <span className={`grid size-5 place-items-center rounded-full text-[11px] font-semibold tabular-nums ${n.done
            ? 'bg-line-strong text-dim' : 'bg-accent text-on-accent'}`}>{n.n}</span>}
          <button onClick={() => void assist.removeNote(n.id)} aria-label="Remove the note"
            className="grid size-6 place-items-center rounded text-dim active:bg-pressed"><Trash2 size={13} /></button>
        </div>
      </div>
    )
  }
  return (
    <div>
      <div className="flex h-12 items-center gap-2 border-y border-line pr-2 pl-4">
        <b>Notes</b> <span className="text-sm text-dim">{open.length} open</span>
        <span className="flex-1" />
        <button onClick={assist.check} disabled={!!job || waiting || !open.length}
          className="flex h-8 items-center gap-1.5 rounded-full bg-pill px-3 text-sm font-semibold active:bg-pressed disabled:opacity-50">
          {job || waiting ? <Spinner size={13} /> : <ListChecks size={14} />}{waiting ? 'Waiting for a node' : 'Check my list'}</button>
        <button onClick={() => setAdding(!adding)} aria-label="New note"
          className="grid size-9 place-items-center rounded-md text-dim active:bg-pressed"><Plus size={16} /></button>
      </div>
      <div className="flex h-12 items-center gap-2 border-b border-line px-4">
        <Segments fit value={view} onChange={setView} options={[['open', 'Open'], ['done', 'Done'], ['all', 'All']]} />
        <span className="flex-1" />
        {view === 'open' && <Switch label="Show done" checked={showDone} onChange={setShowDone} />}
      </div>
      {adding && (
        <div className="border-b border-line p-3">
          <textarea autoFocus value={text} onChange={(e) => setText(e.target.value)} rows={2} aria-label="New note"
            placeholder="A to-do or a comment"
            className="block w-full resize-none rounded-lg bg-soft px-3 py-2 outline-none placeholder:text-faint focus:ring-1 focus:ring-accent" />
          <div className="mt-2 flex items-center gap-2">
            <span className="min-w-0 flex-1 text-xs text-dim">For a note on a line, use Note in the editor or on a change.</span>
            <Button small kind="quiet" onClick={() => setAdding(false)}>Cancel</Button>
            <Button small kind="primary" disabled={!text.trim()} onClick={() => void add()}>Add</Button>
          </div>
        </div>
      )}
      {job && (
        <div className="flex items-center gap-2.5 border-b border-line bg-inset px-4 py-3 text-sm">
          <Spinner size={14} /> <span className="min-w-0 flex-1"><b>{shortLabel(job.label)}</b> is checking {plural(open.length, 'open note')}, <Seconds from={job.started} /></span>
          <Button small kind="quiet" onClick={() => assist.cancel(job.id)}>Cancel</Button>
        </div>
      )}
      {checked && !job && counts && (
        <div className="flex gap-2.5 border-b border-line bg-inset px-4 py-3 text-sm">
          <AgentIcon agent={agentOf(checked.job.label)} />
          <div className="min-w-0 flex-1"><b>Checked {plural(checked.result.checked, 'open note')}</b> <span className="text-dim">against your changes · {checked.job.seconds} s</span>
            <p className="mt-1 text-dim">{counts[0]} {counts[0] === 1 ? 'looks' : 'look'} done, {counts[1]} not yet, {counts[2]} unsure. You decide each one.</p></div>
          <button onClick={assist.clearChecked} aria-label="Put the results away"
            className="grid size-6 shrink-0 place-items-center rounded text-dim active:bg-pressed"><X size={13} /></button>
        </div>
      )}
      {!assist.notes ? <div className="grid h-24 place-items-center"><Spinner /></div>
        : !list.length && !(view === 'open' && showDone && done.length) ? (
          <p className="px-6 py-10 text-center text-sm text-dim">{view === 'done' ? 'Nothing checked off yet.'
            : 'No notes yet. Add a to-do with +, or a note on a line from the editor or a change.'}</p>)
        : list.map(row)}
      {view === 'open' && showDone && done.length > 0 && <>
        <div className="px-4 pt-3 pb-1 text-xs font-semibold text-dim">Done · {done.length}</div>
        {done.map(row)}
      </>}
      <p className="px-4 py-3 text-xs text-dim">Notes stay in this copy of the paper, in .git. They are never committed or pushed.</p>
    </div>
  )
}
