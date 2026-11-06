import { ChevronLeft, ChevronRight, Cloud, GitBranch, Tag, X } from 'lucide-react'
import { useMemo, useRef, useState } from 'react'

import type { HCommit, Lanes, SavedVersion } from '../../../../types/history'
import { plural, when } from '../format'

type Point = { v: string; x: number; lane: 0 | 1; kind: 'commit' | 'saved' | 'now'; c?: HCommit; tag?: string
  label?: string }

type Props = {
  commits: HCommit[]  // newest first
  saved: SavedVersion[]
  branch: string
  lanes: Lanes | null  // compare with a branch: only_b get the second lane
  before: string
  after: string  // "" is now
  backup: boolean
  onChange: (before: string, after: string) => void
  onClose: () => void
}

export function Timeline({ commits, saved, branch, lanes, before, after, backup, onChange, onClose }: Props) {
  const track = useRef<HTMLDivElement>(null)
  const [drag, setDrag] = useState<'before' | 'after' | null>(null)
  const points = useMemo(() => {
    const old = [...commits].reverse()
    const other = lanes ? [...lanes.only_b].reverse() : []
    const head = commits[0]?.hash ?? ''
    const items: Omit<Point, 'x'>[] = []
    for (const c of old) {
      items.push({ v: c.hash, lane: 0, kind: 'commit', c, tag: c.tags[0] })
      for (const s of saved.filter((x) => x.base === c.hash && c.hash !== head).slice(0, 3)) {
        items.push({ v: s.hash, lane: 0, kind: 'saved' })
      }
    }
    for (const s of saved.filter((x) => x.base === head).slice(0, 3).reverse()) items.push({ v: s.hash, lane: 0, kind: 'saved' })
    if (!lanes) items.push({ v: '', lane: 0, kind: 'now', label: 'Now' })
    const n = Math.max(1, items.length - 1)
    const pts: Point[] = items.map((p, i) => ({ ...p, x: i / n }))
    if (lanes && other.length) {
      const base = pts.find((p) => p.v === lanes.base)?.x ?? 0.5
      other.forEach((c, i) => pts.push({ v: c.hash, lane: 1, kind: 'commit', c, x: base + ((1 - base) * (i + 1)) / (other.length + 0.4) }))
    }
    return pts
  }, [commits, saved, lanes])
  const at = (v: string) => points.find((p) => p.v === v || p.c?.short === v)
  const b = at(before), a = at(after)
  const dates = useMemo(() => {
    const out: { x: number; text: string }[] = []
    let last = -1
    for (const p of points) {
      if (p.kind === 'commit' && p.lane === 0 && p.c && p.x - last > 0.09) {
        out.push({ x: p.x, text: when(p.c.time) })
        last = p.x
      }
    }
    return out
  }, [points])
  const lanesY = lanes ? [26, 62] : [30]

  const nearest = (clientX: number, clientY: number) => {
    const r = track.current!.getBoundingClientRect()
    const fx = (clientX - r.left) / r.width, y = clientY - r.top
    const lane = lanes && Math.abs(y - lanesY[1]) < Math.abs(y - lanesY[0]) ? 1 : 0
    const pool = points.filter((p) => p.lane === lane || (lane === 1 && p.v === lanes?.base))
    return pool.reduce((best, p) => Math.abs(p.x - fx) < Math.abs(best.x - fx) ? p : best, pool[0])
  }
  const move = (e: React.PointerEvent) => {
    if (!drag) return
    const p = nearest(e.clientX, e.clientY)
    if (!p) return
    if (drag === 'before' && p.v !== before) onChange(p.v, after)
    if (drag === 'after' && p.v !== after) onChange(before, p.v)
  }
  const step = (d: 1 | -1) => {
    const line = points.filter((p) => p.lane === (a?.lane ?? 0) && p.kind !== 'saved')
    const i = line.findIndex((p) => p.v === before), j = line.findIndex((p) => p.v === after)
    if (i < 0 || j < 0 || i + d < 0 || j + d >= line.length) return
    onChange(line[i + d].v, line[j + d].v)
  }
  const handle = (which: 'before' | 'after', p: Point | undefined) => p && (
    <div onPointerDown={(e) => { e.preventDefault(); (e.target as HTMLElement).setPointerCapture(e.pointerId); setDrag(which) }}
      style={{ left: `${p.x * 100}%`, top: lanesY[p.lane] }} role="slider" aria-label={which === 'before' ? 'Before' : 'After'}
      aria-valuetext={p.c?.subject ?? 'Now'} tabIndex={0}
      className="absolute z-[2] -translate-x-1/2 -translate-y-1/2 cursor-grab touch-none active:cursor-grabbing">
      <span className={`absolute -top-[30px] left-1/2 -translate-x-1/2 rounded px-1.5 py-0.5 text-[11px] font-semibold
        whitespace-nowrap ${which === 'after' ? 'bg-text text-window' : 'border border-line-strong bg-window'}`}>
        {which === 'before' ? 'Before' : 'After'}</span>
      <span className="grid h-7 w-3.5 place-items-center rounded-md border-2 border-text bg-window">
        <span className="h-3 w-[2px] bg-text" /></span>
    </div>
  )
  const lo = b && a ? Math.min(b.x, a.x) : 0, hi = b && a ? Math.max(b.x, a.x) : 0
  return (
    <div className="flex shrink-0 items-stretch gap-4 border-b border-line px-4 pt-3 pb-2">
      {lanes ? (
        <div className="relative w-[150px] shrink-0 text-sm">
          {[branch, lanes.b].map((name, i) => (
            <span key={name} style={{ top: lanesY[i] - 10 }} title={name}
              className={`absolute inset-x-0 flex items-center gap-1.5 truncate ${i ? '' : 'font-semibold'}`}>
              <GitBranch size={13} className="shrink-0" /> <span className="truncate">{name}</span></span>
          ))}
        </div>
      ) : (
        <div className="w-[120px] shrink-0 leading-tight">
          <div className="font-semibold">History</div>
          <div className="text-xs text-dim">{plural(commits.length, 'commit')}</div>
          {saved.length > 0 && <div className="text-xs text-dim">{plural(saved.length, 'saved version')}</div>}
          {backup && <div className="mt-1 flex items-center gap-1 font-mono text-[11px] text-dim"><Cloud size={11} />
            saved/{branch}</div>}
        </div>
      )}
      <div ref={track} onPointerMove={move} onPointerUp={() => setDrag(null)} onPointerCancel={() => setDrag(null)}
        className="relative mx-3 min-w-0 flex-1 select-none" style={{ height: lanes ? 96 : 64 }}>
        {lanesY.map((y, i) => <div key={i} className="absolute h-px bg-line-strong" style={{ top: y,
          left: i ? `${(points.find((p) => p.v === lanes?.base)?.x ?? 0) * 100}%` : 0, right: 0 }} />)}
        {lanes && (() => {
          const x = (points.find((p) => p.v === lanes.base)?.x ?? 0) * 100
          return <svg className="absolute inset-0 h-full w-full overflow-visible" preserveAspectRatio="none">
            <line x1={`${x}%`} y1={lanesY[0]} x2={`${x + 3}%`} y2={lanesY[1]} className="stroke-line-strong" strokeWidth={1} />
          </svg>
        })()}
        {b && a && b.lane === a.lane && <div className="absolute h-[3px] -translate-y-1/2 bg-text"
          style={{ left: `${lo * 100}%`, width: `${(hi - lo) * 100}%`, top: lanesY[a.lane] }} />}
        {points.map((p) => (
          <button key={`${p.lane}${p.v}`} onClick={() => onChange(before, p.v)} title={p.c ? `${p.c.subject} · ${p.c.author}`
            : p.kind === 'saved' ? 'Saved version' : 'Now, with changes not committed yet'}
            style={{ left: `${p.x * 100}%`, top: lanesY[p.lane] }}
            className={`absolute -translate-x-1/2 -translate-y-1/2 rounded-full border-2 bg-window ${p.kind === 'saved'
              ? 'size-[7px] border-0 bg-faint' : p.kind === 'now' ? 'size-3 border-dashed border-dim' : 'size-3 border-dim'}`} />
        ))}
        {points.filter((p) => p.tag).map((p) => (
          <span key={`t${p.v}`} style={{ left: `${p.x * 100}%`, top: lanesY[0] - 28 }}
            className="absolute flex -translate-x-1/2 items-center gap-1 rounded border border-line-strong bg-window px-1.5
              text-[11px] whitespace-nowrap text-dim"><Tag size={10} /> {p.tag}</span>
        ))}
        {dates.map((d) => <span key={d.x} style={{ left: `${d.x * 100}%`, top: (lanes ? lanesY[1] : lanesY[0]) + 16 }}
          className="absolute -translate-x-1/2 text-[11px] whitespace-nowrap text-dim">{d.text}</span>)}
        {handle('before', b)}
        {handle('after', a)}
      </div>
      <div className="flex w-[200px] shrink-0 flex-col items-end gap-1.5">
        <div className="flex gap-1.5">
          <button onClick={() => step(-1)} className="flex h-8 items-center gap-1 rounded-md bg-pill px-2.5 text-sm
            font-semibold hover:bg-pressed"><ChevronLeft size={14} /> Older</button>
          <button onClick={() => step(1)} className="flex h-8 items-center gap-1 rounded-md bg-pill px-2.5 text-sm
            font-semibold hover:bg-pressed">Newer <ChevronRight size={14} /></button>
          <button onClick={onClose} aria-label="Close the timeline" className="grid size-8 place-items-center rounded-md
            text-dim hover:bg-hover"><X size={15} /></button>
        </div>
        <span className="text-right text-xs text-dim">{lanes ? 'Drag a handle onto any dot, on any branch'
          : 'Drag a handle to compare any two'}</span>
      </div>
    </div>
  )
}
