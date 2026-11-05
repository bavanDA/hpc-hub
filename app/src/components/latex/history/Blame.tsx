// C: Who changed it. A column beside the editor with who last changed each line and how long ago (a darker bar is
// newer); a click on a line opens a card with the commit's message, the line before and after, Show in PDF, Open in
// History and Older change, to follow the line further back.
import { type Extension, Prec, StateField } from '@codemirror/state'
import { EditorView, gutter, GutterMarker } from '@codemirror/view'
import { ArrowLeft, Copy, History as HistoryIcon, ScrollText, X } from 'lucide-react'
import { useEffect, useState } from 'react'

import type { Blame, LineStory } from '../../../types/history'
import { useToast } from '../../toast'
import { Spinner } from '../../ui'
import { Avatar, fullDate, git, initials, lastLine, plural, when, type Where } from './bits'
import { Tex } from './DiffView'

type Cell = { first: boolean; who: string; age: string; fresh: number; uncommitted: boolean } | null

/** "2h", "1d", "Oct 22": short, for the column. */
function short(ts: number): string {
  const s = Date.now() / 1000 - ts
  if (s < 3600) return `${Math.max(1, Math.floor(s / 60))}m`
  if (s < 86400) return `${Math.floor(s / 3600)}h`
  if (s < 7 * 86400) return `${Math.floor(s / 86400)}d`
  return new Date(ts * 1000).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

export function cells(b: Blame): Cell[] {
  const times = Object.values(b.commits).filter((c) => !c.uncommitted).map((c) => c.time)
  const lo = Math.min(...times), hi = Math.max(...times)
  return b.lines.map(([h], i) => {
    const c = b.commits[h]
    if (!c) return null
    return { first: i === 0 || b.lines[i - 1][0] !== h, who: c.uncommitted ? 'Not committed' : c.author,
      age: c.uncommitted ? 'now' : short(c.time), uncommitted: c.uncommitted,
      fresh: c.uncommitted ? 1 : hi > lo ? (c.time - lo) / (hi - lo) : 1 }
  })
}


class Marker extends GutterMarker {
  cell: Cell
  constructor(cell: Cell) { super(); this.cell = cell }
  eq(o: Marker) { return JSON.stringify(o.cell) === JSON.stringify(this.cell) }
  toDOM() {
    const el = document.createElement('div')
    el.className = 'cm-blame-cell'
    const c = this.cell
    el.style.setProperty('--fresh', String(0.15 + 0.85 * (c?.fresh ?? 0)))
    if (c?.first) {
      const who = document.createElement('span')
      who.className = c.uncommitted ? 'cm-blame-who cm-blame-mine' : 'cm-blame-who'
      if (!c.uncommitted) {
        const ini = document.createElement('span')
        ini.className = 'cm-blame-ini'
        ini.textContent = initials(c.who)
        who.append(ini)
      }
      who.append(c.who)
      const age = document.createElement('span')
      age.className = 'cm-blame-age'
      age.textContent = c.age
      el.append(who, age)
    }
    return el
  }
}

const look = EditorView.theme({
  '.cm-blame': { width: '168px', borderRight: '1px solid var(--color-line)', cursor: 'pointer' },
  '.cm-blame-cell': { position: 'relative', display: 'flex', gap: '6px', alignItems: 'flex-start', height: '100%',
    padding: '0 8px 0 10px', fontFamily: 'var(--font-sans)', fontSize: '12px', lineHeight: '20px',
    color: 'var(--color-dim)' },
  '.cm-blame-cell::before': { content: '""', position: 'absolute', left: '0', top: '0', bottom: '0', width: '3px',
    background: 'var(--color-text)', opacity: 'var(--fresh)' },
  '.cm-blame-who': { flex: '1', minWidth: '0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
    color: 'var(--color-text)', display: 'flex', alignItems: 'center', gap: '5px', height: '20px' },
  '.cm-blame-mine': { fontStyle: 'italic', color: 'var(--color-dim)' },
  '.cm-blame-ini': { display: 'inline-grid', placeItems: 'center', width: '17px', height: '17px', borderRadius: '50%',
    border: '1px solid var(--color-line-strong)', fontSize: '8px', fontWeight: '600', color: 'var(--color-dim)',
    flexShrink: '0' },
  '.cm-blame-age': { flexShrink: '0', fontVariantNumeric: 'tabular-nums' },
})

/** The column, for CodeEditor's extensions (made again when the data changes). pick(line, x, y) on a click. */
export function blameColumn(data: Cell[], pick: (line: number, x: number, y: number) => void): Extension {
  const field = StateField.define<Cell[]>({ create: () => data, update: (v) => v })
  return [field, look, Prec.highest(gutter({
    class: 'cm-blame',
    lineMarker: (view, line) => new Marker(view.state.field(field)[view.state.doc.lineAt(line.from).number - 1] ?? null),
    initialSpacer: () => new Marker(null),
    domEventHandlers: {
      click: (view, line, e) => {
        const ev = e as MouseEvent
        pick(view.state.doc.lineAt(line.from).number, ev.clientX, ev.clientY)
        return true
      },
    },
  }))]
}

// -- the card ---------------------------------------------------------------------------------------------------------
type Step = { path: string; line: number; at: string }

export function LineCard({ where, start, x, y, onClose, onPdf, onHistory }:
  { where: Where; start: Step; x: number; y: number; onClose: () => void
    onPdf: (line: number) => void; onHistory: (hash: string) => void }) {
  const toast = useToast()
  const [trail, setTrail] = useState<Step[]>([start])
  const [story, setStory] = useState<LineStory | null>(null)
  const [error, setError] = useState('')
  const step = trail[trail.length - 1]
  useEffect(() => {
    setStory(null)
    setError('')
    git<LineStory>('line', where, { path: step.path, line: step.line, at: step.at }).then(setStory)
      .catch((e: Error) => setError(lastLine(e.message)))
  }, [where, step])
  useEffect(() => {
    const key = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', key)
    return () => window.removeEventListener('keydown', key)
  }, [onClose])
  const left = Math.min(x + 12, window.innerWidth - 460), top = Math.min(y - 20, window.innerHeight - 330)
  const s = story && !story.uncommitted ? story : null
  return (
    <div style={{ left, top }} onMouseDown={(e) => e.stopPropagation()}
      className="menu-in fixed z-40 w-[440px] rounded-xl border border-line bg-raised p-4 shadow-[var(--shadow-dialog)]">
      {!story && !error && <div className="grid h-24 place-items-center"><Spinner /></div>}
      {error && <p className="text-bad">{error}</p>}
      {story?.uncommitted && <>
        <div className="flex items-start"><b className="flex-1">Not committed yet</b><Close onClose={onClose} /></div>
        <p className="mt-1 text-sm text-dim">You changed this line since your last commit. It goes in with your next
          commit.</p>
        <div className="mt-3 flex gap-2">
          <Act icon={<ScrollText size={14} />} label="Show in PDF" solid onClick={() => onPdf(start.line)} />
          <Act icon={<HistoryIcon size={14} />} label="Open in History" onClick={() => onHistory('')} />
        </div>
      </>}
      {s && <>
        <div className="flex items-start gap-2.5">
          <Avatar name={s.commit.author} size={26} />
          <div className="min-w-0 flex-1 leading-tight">
            <div><b>{s.commit.author}</b> <span className="text-dim">· {when(s.commit.time)}</span></div>
            <div className="text-xs text-dim">{fullDate(s.commit.time)}</div>
          </div>
          <button onClick={() => navigator.clipboard.writeText(s.commit.hash).then(() => toast('Commit id copied'))
            .catch(() => {})} className="flex items-center gap-1 rounded bg-pill px-1.5 font-mono text-xs hover:bg-pressed">
            {s.commit.short} <Copy size={11} /></button>
          <Close onClose={onClose} />
        </div>
        <div className="mt-3 font-semibold">{s.commit.subject}</div>
        {s.commit.body && <p className="mt-1 line-clamp-4 text-sm whitespace-pre-line text-dim">{s.commit.body}</p>}
        {s.rows.length > 0 && (
          <div className="mt-3 overflow-hidden rounded-lg border border-line font-mono text-xs leading-[19px]">
            {s.rows.map((r, i) => (
              <div key={i} className={`flex gap-2 px-2 ${r.k === '-' ? 'diff-del' : 'diff-add'}`}>
                <span className="w-3 shrink-0 text-dim">{r.k}</span>
                <span className="min-w-0 flex-1 break-words whitespace-pre-wrap"><Tex text={r.t} marks={r.m}
                  markClass={r.k === '-' ? 'diff-del-mark' : 'diff-add-mark'} /></span>
              </div>
            ))}
            {s.more > 0 && <div className="px-2 py-0.5 font-sans text-dim">and {plural(s.more, 'more line')} in this
              commit</div>}
          </div>
        )}
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {trail.length === 1 && <Act icon={<ScrollText size={14} />} label="Show in PDF" solid
            onClick={() => onPdf(start.line)} />}
          {trail.length > 1 && <Act icon={<ArrowLeft size={14} />} label="Newer" onClick={() => setTrail(trail.slice(0, -1))} />}
          <Act icon={<HistoryIcon size={14} />} label="Open in History" onClick={() => onHistory(s.commit.hash)} />
          <span className="flex-1" />
          {s.older && <Act icon={<ArrowLeft size={14} />} label="Older change"
            onClick={() => setTrail([...trail, { path: s.older!.path, line: s.older!.line, at: s.older!.rev }])} />}
        </div>
        <p className="mt-3 border-t border-line pt-2.5 text-sm text-dim">{s.older
          ? <>Before this, the line came from <b className="text-text">{s.older.subject}</b> by {s.older.author},
            {' '}{when(s.older.time)}.</>
          : 'This is the commit that wrote the line first.'}</p>
      </>}
    </div>
  )
}

function Close({ onClose }: { onClose: () => void }) {
  return <button onClick={onClose} aria-label="Close" className="grid size-7 place-items-center rounded-md text-dim
    hover:bg-hover"><X size={15} /></button>
}

function Act({ icon, label, onClick, solid }: { icon: React.ReactNode; label: string; onClick: () => void; solid?: boolean }) {
  return (
    <button onClick={onClick} className={`flex h-8 items-center gap-1.5 rounded-md px-2.5 text-sm font-semibold ${solid
      ? 'bg-text text-window hover:opacity-90' : 'bg-pill hover:bg-pressed'}`}>{icon} {label}</button>
  )
}
