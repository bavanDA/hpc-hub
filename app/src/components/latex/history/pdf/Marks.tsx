import { ChevronDown, ChevronUp, Loader2, MessageCircleQuestion, StickyNote } from 'lucide-react'
import { useEffect, useState } from 'react'

import { call } from '../../../../rpc'
import type { Changes, Note, Row, SyncSpot } from '../../../../types/history'
import type { Where } from '../git'
import type { CardSpot } from '../notes/SpotCard'
import { visibleWords } from './visibleWords'
import { NoPdf } from './NoPdf'
import { Pages } from './Pages'
import type { Click, Group, PdfMark } from './types'
import { usePins } from './usePins'

export function Marks({ where, main, root, current, changes, zoom, onSource, notes, onPin, onSpot }:
  { where: Where; main: string; root: string; current: Uint8Array | null; changes: Changes | null; zoom: number
    onSource: (path: string, line: number) => void; notes: Note[]; onPin: (id: string) => void; onSpot: (s: CardSpot) => void }) {
  const pins = usePins(where, main, root, notes)
  const [menu, setMenu] = useState<Click | null>(null)
  useEffect(() => {
    if (!menu) return
    const off = () => setMenu(null)
    window.addEventListener('mousedown', off)
    window.addEventListener('keydown', off)
    return () => { window.removeEventListener('mousedown', off); window.removeEventListener('keydown', off) }
  }, [menu])
  const spot = async (c: Click, mode: CardSpot['mode']) => {
    setMenu(null)
    const place = { page: c.page, x: Math.round(c.x * 10) / 10, y: Math.round(c.y * 10) / 10 }
    const src = mode === 'ask' ? await call<{ path: string; line: number } | null>('latex.sync_edit', { cluster: where.cluster,
      main, page: c.page, x: c.x, y: c.y }).catch(() => null) : null
    const rel = src && src.path.startsWith(root + '/') ? src.path.slice(root.length + 1) : ''
    onSpot({ id: `pdf-${Date.now()}`, mode, title: `page ${c.page}`, place, here: rel || undefined,
      about: rel ? { kind: 'pdf', page: c.page, path: rel, line: src!.line, end: src!.line + 2, text: c.text }
        : { kind: 'pdf', page: c.page, text: c.text } })
  }
  const [groups, setGroups] = useState<Group[] | null>(null)
  const [note, setNote] = useState('')
  const [at, setAt] = useState(0)
  const [jump, setJump] = useState(0)
  useEffect(() => {
    if (!changes) return
    let dead = false
    setGroups(null)
    ;(async () => {
      const found: PdfMark[] = []
      let missing = 0
      for (const f of changes.files.filter((x) => /\.tex$/.test(x.path) && x.status !== 'D')) {
        const abs = `${root}/${f.path}`
        const text = await call<{ text: string }>('latex.read', { cluster: where.cluster, path: abs })
          .then((r) => r.text.split('\n')).catch(() => null)
        if (!text) continue
        const rows: { row: Row; before: Row | null; line: number }[] = []
        for (const h of f.hunks) {
          let pending: Row[] = []
          for (const r of h.rows) {
            if (r.k === '-' && !r.mv) pending.push(r)
            if (r.k !== '+' || r.same || r.src) { if (r.k === ' ') pending = []; continue }
            const before = pending.find((p) => p.m.length) ?? null
            if (before) pending = pending.filter((p) => p !== before)
            // where the line is in the file now (later commits may have moved it)
            const near = (n: number) => {
              for (let d = 0; d < 400; d++) {
                const i = n - 1 + (d % 2 ? -(d + 1) / 2 : d / 2)
                if (text[i] === r.t) return i
              }
            }
            const i = near(r.n ?? 1)
            if (i === undefined) { missing++; continue }
            rows.push({ row: r, before, line: i + 1 })
          }
        }
        if (!rows.length) continue
        const spots = await call<SyncSpot[]>('latex.git_sync_lines', { cluster: where.cluster, main, path: abs,
          lines: rows.map((x) => x.line) }).catch(() => [])
        rows.forEach((x, k) => {
          const s = spots[k]
          if (!s) return
          const words = x.row.m.length ? x.row.m.flatMap(([a, b]) => visibleWords(x.row.t.slice(a, b))) : visibleWords(x.row.t)
          found.push({ page: s.page, y: s.y, words, path: abs, line: x.line, before: x.before, after: x.row })
        })
      }
      if (dead) return
      found.sort((a, b) => a.page - b.page || a.y - b.y)
      const gs: Group[] = []
      for (const t of found) {
        const g = gs[gs.length - 1]
        if (g && g.page === t.page && t.y - g.targets[g.targets.length - 1].y < 40) g.targets.push(t)
        else gs.push({ page: t.page, y: t.y, targets: [t] })
      }
      setGroups(gs)
      setAt(0)
      setNote(missing ? `${missing} changed ${missing === 1 ? 'line has' : 'lines have'} been edited again since, so
        ${missing === 1 ? 'it is' : 'they are'} not marked.` : '')
    })().catch((e: Error) => { if (!dead) { setGroups([]); setNote(e.message) } })
    return () => { dead = true }
  }, [changes, where, main, root])

  if (!current) return <NoPdf text="No PDF yet. Recompile to build it, then the changes show on it." />
  const g = groups?.[at]
  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      <div className="flex h-9 shrink-0 items-center justify-center gap-2 border-b border-line text-sm text-dim">
        {!groups ? <><Loader2 size={13} className="animate-spin" /> Finding the changes on the PDF</>
          : !groups.length ? 'These changes are not on the PDF (or the PDF is older than them).'
          : <>Change <b className="text-text">{at + 1}</b> of {groups.length} on page {g?.page}
            <button aria-label="Previous change" disabled={at === 0} onClick={() => { setAt(at - 1); setJump(jump + 1) }}
              className="grid size-7 place-items-center rounded-md hover:bg-hover disabled:opacity-40"><ChevronUp size={15} /></button>
            <button aria-label="Next change" disabled={at >= groups.length - 1} onClick={() => { setAt(at + 1); setJump(jump + 1) }}
              className="grid size-7 place-items-center rounded-md hover:bg-hover disabled:opacity-40"><ChevronDown size={15} /></button></>}
      </div>
      <Pages data={current} zoom={zoom} groups={groups ?? []} focus={g ? { page: g.page, y: g.y, n: jump } : null}
        onSource={onSource} pins={pins} onPin={onPin} onContext={setMenu} />
      {menu && (
        <div style={{ left: menu.cx, top: menu.cy }} onMouseDown={(e) => e.stopPropagation()}
          className="menu-in fixed z-30 w-[220px] rounded-xl border border-line bg-raised p-1.5 shadow-[var(--shadow-dialog)]">
          <button onClick={() => void spot(menu, 'ask')}
            className="flex h-9 w-full items-center gap-2 rounded-md px-2.5 text-left text-sm hover:bg-hover">
            <MessageCircleQuestion size={15} /> Ask about this spot</button>
          <button onClick={() => void spot(menu, 'note')}
            className="flex h-9 w-full items-center gap-2 rounded-md px-2.5 text-left text-sm hover:bg-hover">
            <StickyNote size={15} /> Add a note here</button>
        </div>
      )}
      <div className="pointer-events-none absolute bottom-3 left-3 flex flex-col gap-1 rounded-xl border border-line
        bg-raised px-3 py-2 text-sm shadow-md">
        <span className="flex items-center gap-2"><span className="diff-add-mark h-3 w-4" />
          New or changed text</span>
        <span className="flex items-center gap-2"><span className="diff-bar ml-1.5 h-3.5 w-[3px] rounded" /> Paragraph changed</span>
        <span className="text-xs text-dim">Right-click a spot to ask about it or note it</span>
      </div>
      {note && <p className="absolute right-3 bottom-3 max-w-[320px] rounded-xl border border-line bg-raised px-3 py-2
        text-sm text-dim shadow-md">{note}</p>}
    </div>
  )
}
