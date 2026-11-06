import { ChevronDown, ChevronUp, Code2, Loader2, MessageCircleQuestion, Minus, Plus, ServerCog, StickyNote } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { useEvent } from '../../../hooks'
import { call } from '../../../rpc'
import type { Changes, Note, PdfJob, Row, SyncSpot } from '../../../types/history'
import { engine, open } from '../../pdf/engine'
import { readFile } from '../../pdf/load'
import { Button } from '../../ui'
import { Tex } from './DiffView'
import { shortHash } from './format'
import { git, type Where } from './git'
import { type CardSpot, isLine, isPage } from './Notes'
import { Segments } from './ui/Segments'

export type PdfMode = 'marks' | 'side' | 'redblue'
type Target = { page: number; y: number; words: string[]; path: string; line: number; before: Row | null; after: Row }
type Group = { page: number; y: number; targets: Target[] }
type PinAt = { id: string; n: number; page: number; y: number; done: boolean; text: string }
/** A right-click on a page: where (PDF points from the page's top), the text around it, and where on screen. */
type Click = { page: number; x: number; y: number; text: string; cx: number; cy: number }

type Props = {
  where: Where
  main: string
  root: string
  clusterName: string
  current: Uint8Array | null  // the PDF you have now
  from: string  // versions: "" is the files now
  to: string
  changes: Changes | null
  guard: (run: () => void) => void  // asks for a compute node first, like Recompile
  onSource: (path: string, line: number) => void
  notes: Note[]  // their pins on the PDF
  onPin: (id: string) => void
  onSpot: (s: CardSpot) => void  // ask about a spot, or note it
}

export function PdfView({ where, main, root, clusterName, current, from, to, changes, guard, onSource, notes, onPin,
  onSpot }: Props) {
  const [mode, setMode] = useState<PdfMode>('marks')
  const [zoom, setZoom] = useState(1)
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex h-11 shrink-0 items-center gap-2 border-b border-line px-4">
        <Segments value={mode} onChange={setMode} options={[['marks', 'Marks'], ['side', 'Side by side'],
          ['redblue', 'Red and blue']]} />
        <span className="flex-1" />
        <button onClick={() => setZoom(Math.max(0.5, zoom - 0.25))} aria-label="Zoom out"
          className="grid size-8 place-items-center rounded-md text-dim hover:bg-hover"><Minus size={15} /></button>
        <span className="w-12 text-center text-sm tabular-nums">{Math.round(zoom * 100)}%</span>
        <button onClick={() => setZoom(Math.min(3, zoom + 0.25))} aria-label="Zoom in"
          className="grid size-8 place-items-center rounded-md text-dim hover:bg-hover"><Plus size={15} /></button>
      </div>
      {mode === 'marks' ? <Marks where={where} main={main} root={root} current={current} changes={changes} zoom={zoom}
          onSource={onSource} notes={notes} onPin={onPin} onSpot={onSpot} />
        : mode === 'side' ? <Side where={where} main={main} clusterName={clusterName} current={current} from={from}
          to={to} zoom={zoom} guard={guard} />
        : <Built key={`${from}-${to}`} where={where} main={main} clusterName={clusterName} version={to} against={from}
          guard={guard} zoom={zoom} what="The red and blue version" />}
    </div>
  )
}

// -- Marks ----------------------------------------------------------------------------------------------------------
const WORD = /[\p{L}\p{N}]+/gu

/** The words a person sees for a marked stretch of LaTeX: commands and math signs out. */
function seen(t: string): string[] {
  return t.replace(/\\[A-Za-z@]+/g, ' ').match(WORD) ?? []
}

/** Where the notes sit on the PDF: a spot as it is, a line through SyncTeX. */
function usePins(where: Where, main: string, root: string, notes: Note[]): PinAt[] {
  const [pins, setPins] = useState<PinAt[]>([])
  const key = JSON.stringify(notes.filter((n) => n.place && !('hash' in n.place)).map((n) => [n.id, n.place, n.done]))
  useEffect(() => {
    let dead = false
    const placed = (JSON.parse(key) as [string][]).map(([id]) => notes.find((n) => n.id === id)!).filter(Boolean)
    const out: PinAt[] = placed.filter((n) => isPage(n.place)).map((n) => {
      const p = n.place as { page: number; y: number }
      return { id: n.id, n: n.n, page: p.page, y: p.y, done: n.done, text: n.text }
    })
    const byPath = new Map<string, Note[]>()
    for (const n of placed) if (isLine(n.place)) byPath.set(n.place.path, [...(byPath.get(n.place.path) ?? []), n])
    ;(async () => {
      for (const [path, list] of byPath) {
        const spots = await call<SyncSpot[]>('latex.git_sync_lines', { cluster: where.cluster, main, path: `${root}/${path}`,
          lines: list.map((n) => (n.place as { line: number }).line) }).catch(() => [] as SyncSpot[])
        list.forEach((n, k) => { const s = spots[k]; if (s) out.push({ id: n.id, n: n.n, page: s.page, y: s.y, done: n.done, text: n.text }) })
      }
      if (!dead) setPins(out)
    })()
    return () => { dead = true }
    // notes is read through key
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, where, main, root])
  return pins
}

function Marks({ where, main, root, current, changes, zoom, onSource, notes, onPin, onSpot }:
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
      const found: Target[] = []
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
          const words = x.row.m.length ? x.row.m.flatMap(([a, b]) => seen(x.row.t.slice(a, b))) : seen(x.row.t)
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

  if (!current) return <Empty text="No PDF yet. Recompile to build it, then the changes show on it." />
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

// -- other versions, built on the cluster ----------------------------------------------------------------------------
type BuildState = { data: Uint8Array | null; error: string; seconds: number; cached: boolean; started: number }

function useBuilt(where: Where, main: string, version: string, against: string | null, guard: (run: () => void) => void,
  skip = false) {
  const [st, setSt] = useState<BuildState>({ data: null, error: '', seconds: 0, cached: false, started: 0 })
  const [job, setJob] = useState('')
  const guardNow = useRef(guard)
  guardNow.current = guard
  const load = useCallback((path: string, seconds: number, cached: boolean) => {
    readFile(where.cluster, path).then((data) => setSt({ data, error: '', seconds, cached, started: 0 }))
      .catch((e: Error) => setSt((s) => ({ ...s, error: e.message, started: 0 })))
  }, [where])
  const start = useCallback(() => {
    setSt({ data: null, error: '', seconds: 0, cached: false, started: 0 })
    const go = () => {
      setSt((s) => ({ ...s, started: Date.now() }))
      git<{ path?: string; id?: string }>('pdf', where, { main, version, against })
        .then((r) => r.path ? load(r.path, 0, true) : setJob(r.id ?? ''))
        .catch((e: Error) => setSt((s) => ({ ...s, error: e.message, started: 0 })))
    }
    guardNow.current(go)
  }, [where, main, version, against, load])
  useEffect(() => { if (!skip) start() }, [skip, start])
  useEvent<PdfJob>('latex-git-pdf', (e) => {
    if (e.id !== job) return
    setJob('')
    if (e.ok) load(e.path, e.seconds, false)
    else setSt((s) => ({ ...s, error: e.error, started: 0 }))
  })
  return { ...st, retry: start }
}

function Building({ what, clusterName, started }: { what: string; clusterName: string; started: number }) {
  const [, tick] = useState(0)
  useEffect(() => { const t = setInterval(() => tick((n) => n + 1), 500); return () => clearInterval(t) }, [])
  return (
    <div className="flex flex-col items-center gap-2 text-dim">
      <Loader2 size={22} className="animate-spin" />
      <span>{started ? `${what} is building on ${clusterName}, ${Math.floor((Date.now() - started) / 1000)} s` : 'Waiting for a compute node'}</span>
      <span className="text-xs">It is kept, so next time it opens at once.</span>
    </div>
  )
}

function Failed({ error, retry }: { error: string; retry: () => void }) {
  return (
    <div className="flex max-w-[460px] flex-col items-center gap-3 text-center">
      <ServerCog size={28} className="text-dim" />
      <p>{error}</p>
      <Button size="sm" onClick={retry}>Try again</Button>
    </div>
  )
}

function Built({ where, main, clusterName, version, against, guard, zoom, what }:
  { where: Where; main: string; clusterName: string; version: string; against: string; guard: (run: () => void) => void
    zoom: number; what: string }) {
  const b = useBuilt(where, main, version, against, guard)
  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      {b.data ? <Pages data={b.data} zoom={zoom} />
        : <div className="grid flex-1 place-items-center bg-inset p-6">{b.error ? <Failed error={b.error} retry={b.retry} />
          : <Building what={what} clusterName={clusterName} started={b.started} />}</div>}
      {b.data && <Kept clusterName={clusterName} seconds={b.seconds} cached={b.cached} what="Red and blue PDF" />}
    </div>
  )
}

function Kept({ clusterName, seconds, cached, what }: { clusterName: string; seconds: number; cached: boolean; what: string }) {
  return (
    <span className="absolute right-3 bottom-3 rounded-full border border-line bg-raised px-3 py-1.5 text-sm text-dim
      shadow-md">{cached ? `${what} kept from before` : `${what} built on ${clusterName} in ${seconds} s, kept for next time`}</span>
  )
}

function Side({ where, main, clusterName, current, from, to, zoom, guard }:
  { where: Where; main: string; clusterName: string; current: Uint8Array | null; from: string; to: string; zoom: number
    guard: (run: () => void) => void }) {
  const before = useBuilt(where, main, from, null, guard)
  const after = useBuilt(where, main, to, null, guard, !to)
  const right = to ? after.data : current
  const a = useRef<HTMLDivElement>(null), b = useRef<HTMLDivElement>(null)
  const syncing = useRef(false)
  const follow = (src: HTMLDivElement | null, dst: HTMLDivElement | null) => {
    if (!src || !dst || syncing.current) return
    syncing.current = true
    dst.scrollTop = (src.scrollTop / Math.max(1, src.scrollHeight - src.clientHeight)) * (dst.scrollHeight - dst.clientHeight)
    requestAnimationFrame(() => { syncing.current = false })
  }
  const col = (label: string, v: string, st: typeof before, data: Uint8Array | null, box: typeof a, other: typeof a) => (
    <div className="flex min-w-0 flex-1 flex-col border-r border-line last:border-r-0">
      <div className="flex h-9 shrink-0 items-center gap-2 border-b border-line px-4 text-sm">
        <b>{label}</b> <span className="rounded bg-pill px-1.5 font-mono text-xs">{v ? shortHash(v) : 'Now'}</span>
        {st.data && !st.cached && v && <span className="text-dim">built on {clusterName} in {st.seconds} s, kept</span>}
        {st.cached && v && <span className="text-dim">kept from before</span>}
      </div>
      {data ? <Pages data={data} zoom={zoom} box={box} onScroll={() => follow(box.current, other.current)} />
        : <div className="grid flex-1 place-items-center bg-inset p-6">{st.error ? <Failed error={st.error} retry={st.retry} />
          : <Building what="That version" clusterName={clusterName} started={st.started} />}</div>}
    </div>
  )
  return (
    <div className="flex min-h-0 flex-1">
      {col('Before', from, before, before.data, a, b)}
      {col('After', to, after, right, b, a)}
    </div>
  )
}

function Empty({ text }: { text: string }) {
  return <div className="grid flex-1 place-items-center bg-inset p-6 text-dim">{text}</div>
}

// -- pages ----------------------------------------------------------------------------------------------------------
type Doc = Awaited<ReturnType<typeof open>['promise']>
type Box = { x: number; y: number; w: number; h: number }
type Drawn = { boxes: Box[]; bar: Box | null; target: Target }

/** A PDF's pages, one under the other, at the pane's width; marks drawn over the pages that have them. */
function Pages({ data, zoom, groups = [], focus = null, box, onScroll, onSource, pins = [], onPin, onContext }:
  { data: Uint8Array; zoom: number; groups?: Group[]; focus?: { page: number; y: number; n: number } | null
    box?: React.RefObject<HTMLDivElement | null>; onScroll?: () => void
    onSource?: (path: string, line: number) => void; pins?: PinAt[]; onPin?: (id: string) => void
    onContext?: (c: Click) => void }) {
  const own = useRef<HTMLDivElement>(null)
  const el = box ?? own
  const [doc, setDoc] = useState<Doc | null>(null)
  const [sizes, setSizes] = useState<{ w: number; h: number }[]>([])
  const [width, setWidth] = useState(800)
  const [error, setError] = useState('')
  useEffect(() => {
    let dead = false, task: ReturnType<typeof open> | null = null
    engine().then(async ({ lib }) => {
      task = open(lib, data)
      const d = await task.promise
      const s = await Promise.all(Array.from({ length: d.numPages }, (_, i) => d.getPage(i + 1)
        .then((p) => { const v = p.getViewport({ scale: 1 }); return { w: v.width, h: v.height } })))
      if (!dead) { setDoc(d); setSizes(s) }
    }).catch((e: Error) => !dead && setError(e.message))
    return () => { dead = true; task?.destroy() }
  }, [data])
  useEffect(() => {
    const node = el.current
    if (!node) return
    const r = new ResizeObserver(() => setWidth(node.clientWidth))
    r.observe(node)
    return () => r.disconnect()
  }, [el])
  const base = sizes[0]?.w ?? 612
  const scale = Math.max(0.3, ((Math.min(width, 1100) - 48) / base) * zoom)
  useEffect(() => {
    if (!focus || !el.current || !sizes.length) return
    const top = sizes.slice(0, focus.page - 1).reduce((a, s) => a + s.h * scale + 16, 16) + focus.y * scale
    el.current.scrollTo({ top: Math.max(0, top - el.current.clientHeight / 3), behavior: 'smooth' })
  }, [focus, sizes, scale, el])
  const byPage = useMemo(() => {
    const m = new Map<number, Target[]>()
    for (const g of groups) for (const t of g.targets) m.set(t.page, [...(m.get(t.page) ?? []), t])
    return m
  }, [groups])
  return (
    <div ref={el} onScroll={onScroll} className="min-h-0 flex-1 overflow-auto bg-[#e9e9ec] dark:bg-[#18181b]">
      {error && <p className="p-6 text-center text-bad">Could not open the PDF: {error}</p>}
      <div className="flex flex-col items-center gap-4 py-4">
        {doc && sizes.map((s, i) => <PageView key={i} doc={doc} n={i + 1} w={s.w * scale} h={s.h * scale} scale={scale}
          targets={byPage.get(i + 1) ?? []} root={el} onSource={onSource} pins={pins.filter((p) => p.page === i + 1)}
          onPin={onPin} onContext={onContext} />)}
      </div>
    </div>
  )
}

function PageView({ doc, n, w, h, scale, targets, root, onSource, pins = [], onPin, onContext }:
  { doc: Doc; n: number; w: number; h: number; scale: number; targets: Target[]
    root: React.RefObject<HTMLDivElement | null>; onSource?: (path: string, line: number) => void
    pins?: PinAt[]; onPin?: (id: string) => void; onContext?: (c: Click) => void }) {
  const canvas = useRef<HTMLCanvasElement>(null)
  const div = useRef<HTMLDivElement>(null)
  const [seen, setSeen] = useState(false)
  const [drawn, setDrawn] = useState<Drawn[]>([])
  const [hover, setHover] = useState<Drawn | null>(null)
  useEffect(() => {
    const node = div.current
    if (!node) return
    const io = new IntersectionObserver(([e]) => { if (e.isIntersecting) setSeen(true) },
      { root: root.current, rootMargin: '600px' })
    io.observe(node)
    return () => io.disconnect()
  }, [root])
  useEffect(() => {
    if (!seen || !canvas.current) return
    let dead = false
    let task: { cancel: () => void; promise: Promise<void> } | null = null
    doc.getPage(n).then((page) => {
      if (dead || !canvas.current) return
      const ratio = window.devicePixelRatio || 1
      const v = page.getViewport({ scale: scale * ratio })
      const c = canvas.current
      c.width = Math.floor(v.width)
      c.height = Math.floor(v.height)
      const t = page.render({ canvas: c, viewport: v } as Parameters<typeof page.render>[0])
      task = t
      t.promise.catch(() => {})
    })
    return () => { dead = true; task?.cancel() }
  }, [seen, doc, n, scale])
  useEffect(() => {
    if (!seen || !targets.length) { setDrawn([]); return }
    let dead = false
    doc.getPage(n).then(async (page) => {
      const height = page.getViewport({ scale: 1 }).height
      const content = await page.getTextContent()
      const items = (content.items as { str: string; transform: number[]; width: number; height: number }[])
        .filter((it) => it.str?.trim())
      const out: Drawn[] = targets.map((t) => {
        const base = height - t.y  // SyncTeX's y is from the top
        const near = items.filter((it) => it.transform[5] <= base + 12 && it.transform[5] >= base - 46)
        const boxes: Box[] = []
        for (const word of t.words) {
          for (const it of near.sort((a, b) => Math.abs(a.transform[5] - base) - Math.abs(b.transform[5] - base))) {
            const at = new RegExp(`(^|[^\\p{L}\\p{N}])${word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![\\p{L}\\p{N}])`, 'u')
              .exec(it.str)
            if (!at) continue
            const i = at.index + at[1].length, size = Math.hypot(it.transform[2], it.transform[3]) || it.height || 10
            const per = it.width / Math.max(1, it.str.length)
            boxes.push({ x: it.transform[4] + per * i - 1, y: height - it.transform[5] - size * 0.82, w: per * word.length + 2,
              h: size * 1.1 })
            break
          }
        }
        const lines = (boxes.length ? boxes : [{ x: 0, y: t.y - 9, w: 0, h: 12 }])
        const left = Math.min(...near.map((it) => it.transform[4]), ...boxes.map((b) => b.x)) || 72
        const top = Math.min(...lines.map((b) => b.y)), bottom = Math.max(...lines.map((b) => b.y + b.h))
        return { boxes, bar: { x: Math.max(4, left - 16), y: top, w: 3, h: Math.max(10, bottom - top) }, target: t }
      })
      if (!dead) setDrawn(out)
    })
    return () => { dead = true }
  }, [seen, targets, doc, n])
  return (
    <div ref={div} style={{ width: w, height: h }} onContextMenu={onContext && ((e) => {
      e.preventDefault()
      const r = div.current!.getBoundingClientRect(), x = (e.clientX - r.left) / scale, y = (e.clientY - r.top) / scale
      const cx = e.clientX, cy = e.clientY
      doc.getPage(n).then(async (page) => {
        const height = page.getViewport({ scale: 1 }).height
        const items = (await page.getTextContent()).items as { str: string; transform: number[] }[]
        const text = items.filter((it) => it.str?.trim() && Math.abs(height - it.transform[5] - y) < 30).map((it) => it.str)
          .join(' ').slice(0, 1500)
        onContext({ page: n, x, y, text, cx, cy })
      }).catch(() => onContext({ page: n, x, y, text: '', cx, cy }))
    })} className="relative shrink-0 bg-white shadow-[0_0_0_1px_rgb(0_0_6/0.06),0_2px_8px_rgb(0_0_6/0.12)]">
      <canvas ref={canvas} style={{ width: w, height: h }} className="block" />
      {pins.map((p) => (
        <button key={p.id} onClick={() => onPin?.(p.id)} title={p.text} style={{ left: w - 30, top: Math.max(2, p.y * scale - 12) }}
          className={`note-pin absolute z-[2] grid size-[22px] place-items-center rounded-full text-xs font-semibold shadow
            ${p.done ? 'done' : ''}`}>{p.n}</button>
      ))}
      {drawn.map((d, i) => (
        <div key={i} onMouseEnter={() => setHover(d)} onMouseLeave={() => setHover(null)}>
          {d.bar && <span className="diff-bar absolute rounded" style={{ left: d.bar.x * scale, top: d.bar.y * scale,
            width: 3, height: d.bar.h * scale }} />}
          {d.boxes.map((b, k) => <span key={k} className="absolute rounded-[3px] bg-[rgb(38_162_105/0.28)] outline outline-1
            outline-[rgb(19_113_64/0.35)]" style={{ left: b.x * scale, top: b.y * scale, width: b.w * scale, height: b.h * scale }} />)}
        </div>
      ))}
      {hover && (
        <div className="absolute z-10 w-[340px] rounded-xl border border-line bg-raised p-3 text-text shadow-xl"
          style={{ left: Math.min(w - 350, Math.max(8, ((hover.boxes[0]?.x ?? 0) + 40) * scale)),
            top: Math.max(8, (hover.bar?.y ?? 0) * scale - 150) }}
          onMouseEnter={() => setHover(hover)} onMouseLeave={() => setHover(null)}>
          <div className="mb-2 flex text-xs font-semibold text-dim"><span className="flex-1">Changed</span>
            <span className="font-normal">{hover.target.path.split('/').pop()}, line {hover.target.line}</span></div>
          {hover.target.before && <HoverLine label="Before" row={hover.target.before} />}
          <HoverLine label="After" row={hover.target.after} />
          {onSource && <button onClick={() => onSource(hover.target.path, hover.target.line)}
            className="mt-2 flex h-8 items-center gap-1.5 rounded-md px-1 text-sm font-semibold hover:bg-hover">
            <Code2 size={14} /> Show in the source</button>}
        </div>
      )}
    </div>
  )
}

function HoverLine({ label, row }: { label: string; row: Row }) {
  return (
    <div className="mb-1.5 flex items-start gap-2">
      <span className="w-11 shrink-0 pt-1 text-xs text-dim">{label}</span>
      <span className="min-w-0 flex-1 rounded-md border border-line px-2 py-1 font-mono text-xs break-words whitespace-pre-wrap">
        <Tex text={row.t} marks={row.m} markClass={row.k === '-' ? 'diff-del-mark' : 'diff-add-mark'} /></span>
    </div>
  )
}
