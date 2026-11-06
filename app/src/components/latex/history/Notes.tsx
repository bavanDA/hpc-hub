import { type Extension, RangeSetBuilder, StateField } from '@codemirror/state'
import { EditorView, gutter, GutterMarker } from '@codemirror/view'
import { Check, CircleHelp, ListChecks, MapPin, MessageCircleQuestion, Plus, Trash2, X } from 'lucide-react'
import { type ReactNode, useEffect, useState } from 'react'

import type { About, Note, NotePlace, Verdict } from '../../../types/history'
import { Button, Spinner, Switch } from '../../ui'
import { AgentIcon } from './Agent'
import { AnswerText, AskBox, type Go, Seconds, Thread } from './Ask'
import { fileName, plural, shortHash, when } from './format'
import { Avatar } from './ui/Avatar'
import { Segments } from './ui/Segments'
import { type Assist, shortLabel } from './useAssist'

export const isLine = (p: NotePlace | null): p is { path: string; line: number } => !!p && 'path' in p
export const isPage = (p: NotePlace | null): p is { page: number; x: number; y: number } => !!p && 'page' in p
export const isCommit = (p: NotePlace | null): p is { hash: string } => !!p && 'hash' in p

/** The numbered pin. */
export function Pin({ n, done = false, size = 18 }: { n: number; done?: boolean; size?: number }) {
  return (
    <span style={{ width: size, height: size, fontSize: size * 0.6 }}
      className={`note-pin grid shrink-0 place-items-center rounded-full font-semibold tabular-nums ${done ? 'done' : ''}`}>
      {n}</span>
  )
}

function PlaceChip({ place, onGo }: { place: NotePlace | null; onGo: () => void }) {
  if (!place) return <span className="rounded bg-pill px-1.5 text-xs text-dim">To-do</span>
  const label = isLine(place) ? <><span className="font-semibold">{fileName(place.path)}</span> {place.line}</>
    : isPage(place) ? <>p. {place.page}</> : <>{shortHash((place as { hash: string }).hash)}</>
  return (
    <button onClick={onGo} title="Go there"
      className="flex h-5 items-center gap-1 rounded bg-pill px-1.5 font-mono text-xs hover:bg-pressed">
      <MapPin size={11} className="text-dim" /> {label}</button>
  )
}

const VERDICT: Record<Verdict['verdict'], [ReactNode, string, string]> = {
  done: [<Check key="d" size={11} />, 'Looks done', 'bg-[rgb(26_127_55/0.12)] text-[var(--diff-add-ink)]'],
  not_yet: [<X key="n" size={11} />, 'Not yet', 'bg-[rgb(207_34_46/0.10)] text-[var(--diff-del-ink)]'],
  unsure: [<CircleHelp key="u" size={11} />, 'Unsure', 'bg-pill text-dim'],
}

type PanelProps = {
  assist: Assist
  focus: string  // a note to show (picked from a pin)
  go: Go & { place: (p: NotePlace) => void }
  onClose: () => void
}

export function NotesPanel({ assist, focus, go, onClose }: PanelProps) {
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
      <div key={n.id} data-note-row={n.id} className={`group flex gap-2.5 border-b border-line px-4 py-3 ${v ? 'bg-inset' : ''}
        ${focus === n.id ? 'ring-2 ring-focus ring-inset' : ''}`}>
        <input type="checkbox" checked={n.done} onChange={(e) => void assist.setNote(n.id, { done: e.target.checked })}
          aria-label={n.done ? 'Open again' : 'Check off'} className="mt-1 size-4 shrink-0 accent-[var(--color-text)]" />
        <div className="min-w-0 flex-1">
          <p className={`leading-5 break-words ${n.done ? 'text-dim line-through' : ''}`}>{n.text}</p>
          <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-dim">
            <PlaceChip place={n.place} onGo={() => n.place && go.place(n.place)} />
            <span className="flex items-center gap-1.5 whitespace-nowrap"><Avatar name={n.author || '?'} size={16} />
              {n.author === assist.notes?.user ? 'You' : n.author} · {when(n.time)}</span>
          </div>
          {v && <>
            <div className="mt-1.5 flex items-start gap-1.5 text-[12.5px]">
              <span className={`flex h-5 shrink-0 items-center gap-1 rounded px-1.5 font-semibold ${VERDICT[v.verdict][2]}`}>
                {VERDICT[v.verdict][0]} {VERDICT[v.verdict][1]}</span>
              <span className="text-dim"><AnswerText text={v.reason} go={go} /></span>
            </div>
            {v.verdict === 'done' && <div className="mt-2 flex gap-1.5">
              <Button size="sm" kind="primary" onClick={() => void assist.setNote(n.id, { done: true })}>
                <Check size={14} /> Check off</Button>
              <Button size="sm" kind="ghost" onClick={() => setKept(new Set([...kept, n.id]))}>Keep open</Button>
            </div>}
          </>}
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          {n.place && <Pin n={n.n} done={n.done} />}
          <button onClick={() => void assist.removeNote(n.id)} aria-label="Remove the note" title="Remove"
            className="grid size-6 place-items-center rounded text-dim opacity-0 group-hover:opacity-100 hover:bg-hover">
            <Trash2 size={13} /></button>
        </div>
      </div>
    )
  }
  return (
    <div className="flex w-[340px] shrink-0 flex-col border-l border-line bg-window">
      <div className="flex h-12 shrink-0 items-center gap-2 border-b border-line pr-2 pl-4">
        <b>Notes</b> <span className="text-sm text-dim">{open.length} open</span>
        <span className="flex-1" />
        <button onClick={assist.check} disabled={!!job || waiting || !open.length}
          title="The agent compares your open notes with your changes. You decide each one."
          className="flex h-8 items-center gap-1.5 rounded-md bg-pill px-2.5 text-sm font-semibold hover:bg-pressed
            disabled:opacity-50">
          {job || waiting ? <Spinner size={13} /> : <ListChecks size={14} />}
          {waiting ? 'Waiting for a node' : 'Check my list'}</button>
        <button onClick={() => setAdding(!adding)} aria-label="New note" title="New note"
          className="grid size-8 place-items-center rounded-md hover:bg-hover"><Plus size={16} /></button>
        <button onClick={onClose} aria-label="Close notes" title="Close"
          className="grid size-8 place-items-center rounded-md text-dim hover:bg-hover"><X size={15} /></button>
      </div>
      <div className="flex h-12 shrink-0 items-center gap-2 border-b border-line px-4">
        <Segments value={view} onChange={setView} options={[['open', 'Open'], ['done', 'Done'], ['all', 'All']]} />
        <span className="flex-1" />
        {view === 'open' && <label className="flex items-center gap-2 text-sm text-dim">Show done
          <Switch on={showDone} onChange={setShowDone} label="Show done" /></label>}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {adding && (
          <div className="border-b border-line p-3">
            <textarea autoFocus value={text} onChange={(e) => setText(e.target.value)} rows={2} aria-label="New note"
              placeholder="A to-do or a comment" onKeyDown={(e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) void add() }}
              className="block w-full resize-none rounded-lg bg-pill px-3 py-2 outline-none placeholder:text-faint
                focus:ring-2 focus:ring-focus" />
            <div className="mt-2 flex items-center gap-2">
              <span className="flex-1 text-xs text-dim">For a note on a line, use Note in the editor or on a change.</span>
              <Button size="sm" kind="ghost" onClick={() => setAdding(false)}>Cancel</Button>
              <Button size="sm" kind="primary" disabled={!text.trim()} onClick={() => void add()}>Add</Button></div>
          </div>
        )}
        {job && (
          <div className="flex items-center gap-2.5 border-b border-line bg-inset px-4 py-3 text-sm">
            <Spinner size={14} /> <span className="flex-1"><b>{shortLabel(job.label)}</b> is checking {plural(open.length,
              'open note')}, <Seconds from={job.started} /></span>
            <Button size="sm" kind="ghost" onClick={() => assist.cancel(job.id)}>Cancel</Button></div>
        )}
        {checked && !job && counts && (
          <div className="flex gap-2.5 border-b border-line bg-inset px-4 py-3 text-sm">
            <AgentIcon agent={checked.job.label.startsWith('ChatGPT') ? 'codex' : 'claude'} />
            <div className="min-w-0 flex-1"><b>Checked {plural(checked.result.checked, 'open note')}</b> <span
              className="text-dim">against your changes · {checked.job.seconds} s</span>
              <p className="mt-1 text-dim">{counts[0]} {counts[0] === 1 ? 'looks' : 'look'} done, {counts[1]} not yet,
                {` ${counts[2]}`} unsure. You decide each one.</p></div>
            <button onClick={assist.clearChecked} aria-label="Put the results away" title="Put the results away"
              className="grid size-6 shrink-0 place-items-center rounded text-dim hover:bg-hover"><X size={13} /></button>
          </div>
        )}
        {!assist.notes ? <div className="grid h-24 place-items-center"><Spinner /></div>
          : !list.length && !(view === 'open' && showDone && done.length) ? (
            <p className="px-6 py-10 text-center text-sm text-dim">{view === 'done' ? 'Nothing checked off yet.'
              : 'No notes yet. Add a to-do with +, or a note on a line from the editor, a change or the PDF.'}</p>)
          : list.map(row)}
        {view === 'open' && showDone && done.length > 0 && <>
          <div className="px-4 pt-3 pb-1 text-xs font-semibold text-dim">Done · {done.length}</div>
          {done.map(row)}
        </>}
        <p className="px-4 py-3 text-xs text-dim">Notes stay in this copy of the paper, in .git. They are never committed or
          pushed.</p>
      </div>
    </div>
  )
}

// -- pins in the editor's gutter ---------------------------------------------------------------------------------
export type GutterPin = { line: number; n: number; done: boolean; text: string; id: string }

class PinMarker extends GutterMarker {
  pins: GutterPin[]
  constructor(pins: GutterPin[]) { super(); this.pins = pins }
  eq(o: PinMarker) { return o.pins.map((p) => p.id + p.done).join() === this.pins.map((p) => p.id + p.done).join() }
  toDOM() {
    const el = document.createElement('span')
    el.className = 'cm-note-pins'
    for (const p of this.pins.slice(0, 2)) {
      const b = document.createElement('span')
      b.className = `note-pin cm-note-pin${p.done ? ' done' : ''}`
      b.textContent = String(p.n)
      b.title = p.text
      b.dataset.note = p.id
      el.append(b)
    }
    return el
  }
}

const pinLook = EditorView.theme({
  '.cm-notes': { width: '24px' },
  '.cm-note-pins': { display: 'flex', alignItems: 'center', height: '100%', paddingLeft: '3px', cursor: 'pointer' },
  '.cm-note-pin': { display: 'inline-grid', placeItems: 'center', width: '16px', height: '16px', borderRadius: '50%',
    fontSize: '10px', fontWeight: '600', fontFamily: 'var(--font-sans)', marginTop: '2px' },
})

/** The column with the notes of the file open in the editor; pick(id) on a click. */
export function notesGutter(pins: GutterPin[], pick: (id: string) => void): Extension {
  const field = StateField.define<GutterPin[]>({ create: () => pins, update: (v) => v })
  return [field, pinLook, gutter({
    class: 'cm-notes',
    markers: (view) => {
      const b = new RangeSetBuilder<GutterMarker>()
      const doc = view.state.doc
      const by = new Map<number, GutterPin[]>()
      for (const p of view.state.field(field)) if (p.line >= 1 && p.line <= doc.lines) by.set(p.line, [...(by.get(p.line) ?? []), p])
      for (const line of [...by.keys()].sort((x, y) => x - y)) b.add(doc.line(line).from, doc.line(line).from, new PinMarker(by.get(line)!))
      return b.finish()
    },
    domEventHandlers: {
      click: (_view, _line, e) => {
        const id = (e.target as HTMLElement).closest<HTMLElement>('[data-note]')?.dataset.note
        if (id) pick(id)
        return !!id
      },
    },
  })]
}

// -- the card for a passage in the editor or a spot in the PDF -----------------------------------------------------
export type CardSpot = { id: string; mode: 'ask' | 'note'; title: string; about: About; place: NotePlace | null
  here?: string }

/** Floats over the editor or the PDF: ask about a passage or a spot (its answers show here), or add a note there. */
export function SpotCard({ spot, assist, go, onClose }: { spot: CardSpot; assist: Assist; go: Go; onClose: () => void }) {
  const [text, setText] = useState('')
  const [asking, setAsking] = useState(true)
  const jobs = assist.jobs.filter((j) => j.ask?.scope === 'card' && j.ask.anchor === spot.id)
  const save = async () => { if (text.trim() && await assist.addNote(text.trim(), spot.place)) onClose() }
  return (
    <div className="menu-in fixed top-36 right-6 z-40 flex max-h-[calc(100vh-180px)] w-[560px] flex-col rounded-xl border
      border-line bg-raised shadow-[var(--shadow-dialog)]">
      <div className="flex shrink-0 items-center gap-2 px-4 pt-3.5">
        {spot.mode === 'note' ? <MapPin size={14} className="text-dim" /> : <MessageCircleQuestion size={14} className="text-dim" />}
        <b className="min-w-0 flex-1 truncate">{spot.mode === 'note' ? 'Note on' : 'Ask about'} {spot.title}</b>
        <button onClick={onClose} aria-label="Close" className="grid size-7 place-items-center rounded-md text-dim hover:bg-hover">
          <X size={14} /></button></div>
      {spot.mode === 'note' ? <div className="px-4 pb-4">
        <textarea autoFocus value={text} onChange={(e) => setText(e.target.value)} rows={3} aria-label="Note"
          placeholder="A to-do or a comment" onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) void save()
            if (e.key === 'Escape') onClose()
          }}
          className="mt-2.5 block w-full resize-none rounded-lg bg-pill px-3 py-2 outline-none placeholder:text-faint
            focus:ring-2 focus:ring-focus" />
        <div className="mt-2.5 flex items-center justify-end gap-2">
          <span className="flex-1 text-xs text-dim">Kept next to the paper in .git, never committed or pushed.</span>
          <Button size="sm" kind="ghost" onClick={onClose}>Cancel</Button>
          <Button size="sm" kind="primary" disabled={!text.trim()} onClick={() => void save()}>Add note</Button>
        </div>
      </div> : <div className="min-h-0 overflow-y-auto px-1 pb-2">
        {jobs.map((j) => <Thread key={j.id} job={j} go={go} here={spot.here} className="mx-3 my-2"
          onNote={(t) => void assist.addNote(t, spot.place)} onMore={() => setAsking(true)}
          onCancel={() => assist.cancel(j.id)} onClose={() => assist.forget(j.id)} />)}
        {asking && <AskBox className="mx-3 my-2" title={spot.title} choice={assist.choice} onClose={jobs.length
          ? () => setAsking(false) : onClose} onAsk={(question, pick) => {
          assist.ask({ question, about: spot.about, scope: 'card', anchor: spot.id, title: spot.title }, pick ?? undefined)
          setAsking(false)
        }} />}
      </div>}
    </div>
  )
}
