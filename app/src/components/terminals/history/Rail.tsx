// The map of the whole session along the terminal's right edge: colored marks for prompts and tables, blue flags for
// marks, a band for where you are. Drag it to read any part of the history; the band sits at the bottom while live.
import { useEffect, useRef, useState } from 'react'

import { isDark, onThemeChange } from '../../../theme'
import type { Mark } from '../../../types/terminals'
import type { HistoryView } from './view'

const FLAG_REACH = 8
const KINDS = [0, 1, 2, 3]

function palette() {
  return isDark()
    ? { text: '#7a7a82', table: '#fce94f', prompt: '#34e2e2', band: 'rgb(255 255 255 / 0.13)', bandLine: 'rgb(255 255 255 / 0.32)' }
    : { text: '#a0a0a8', table: '#b58300', prompt: '#06989a', band: 'rgb(0 0 6 / 0.10)', bandLine: 'rgb(0 0 6 / 0.24)' }
}

const accent = () => getComputedStyle(document.documentElement).getPropertyValue('--color-accent-text').trim() || '#1c71d8'

type Pin = { mark: Mark; y: number }

export function Rail({ view, phone, onOpenMark }: { view: HistoryView; phone: boolean; onOpenMark: (m: Mark) => void }) {
  const host = useRef<HTMLDivElement>(null)
  const canvas = useRef<HTMLCanvasElement>(null)
  const pins = useRef<Pin[]>([])
  const [tip, setTip] = useState<{ y: number; text: string; sub?: string } | null>(null)
  const [drag, setDrag] = useState(false)

  const draw = () => {
    const el = host.current, c = canvas.current
    if (!el || !c || !el.clientWidth || !el.clientHeight) return
    const W = el.clientWidth, H = el.clientHeight, r = window.devicePixelRatio || 1
    if (c.width !== Math.round(W * r) || c.height !== Math.round(H * r)) { c.width = Math.round(W * r); c.height = Math.round(H * r) }
    const ctx = c.getContext('2d')
    if (!ctx) return
    ctx.setTransform(r, 0, 0, r, 0, 0)
    ctx.clearRect(0, 0, W, H)
    const col = palette()
    const total = view.total || 1
    const sx = phone ? 5 : 8, mw = W - sx - 4
    const barH = Math.max(1, H / Math.max(view.map.length, 1))
    const tone = [null, col.text, col.table, col.prompt]
    view.map.forEach(([kind, len], i) => {
      if (kind === 0) return
      const f = tone[KINDS[kind] ?? 1]
      if (!f) return
      ctx.globalAlpha = kind === 1 ? 0.5 : 0.8
      ctx.fillStyle = f
      ctx.fillRect(sx, (i / view.map.length) * H, Math.max(3, Math.min(1, len / (view.width || 80)) * mw), Math.max(1, barH * 0.7))
    })
    ctx.globalAlpha = 0.9
    ctx.fillStyle = col.prompt
    for (const y of view.prompts) ctx.fillRect(0, (y / total) * H - 1, W, 2)
    ctx.globalAlpha = 1
    if (view.total > 0) {
      const top = view.reading ? view.top : Math.max(total - view.visibleRows, 0)
      const bandH = Math.max(phone ? 28 : 14, (view.visibleRows / total) * H)
      const by = Math.min((top / total) * H, H - bandH)
      ctx.fillStyle = col.band
      ctx.fillRect(0, by, W, bandH)
      ctx.strokeStyle = col.bandLine
      ctx.lineWidth = 1
      ctx.strokeRect(0.5, by + 0.5, W - 1, bandH - 1)
    }
    ctx.fillStyle = accent()
    pins.current = view.marks.filter((m) => m.live).map((mark) => {
      const y = (mark.line / total) * H
      ctx.beginPath()
      ctx.moveTo(0, y - 5)
      ctx.lineTo(9, y)
      ctx.lineTo(0, y + 5)
      ctx.closePath()
      ctx.fill()
      return { mark, y }
    })
  }

  useEffect(() => { draw() })  // every change of the view; drawing is cheap and the view changes rarely
  useEffect(() => {
    const watch = new ResizeObserver(draw)
    if (host.current) watch.observe(host.current)
    const off = onThemeChange(draw)
    return () => { watch.disconnect(); off() }
  })

  const yOf = (e: React.PointerEvent) => e.clientY - host.current!.getBoundingClientRect().top
  const seek = (y: number) => {
    const H = host.current?.clientHeight || 1
    view.openAt(Math.max(0, Math.round((y / H) * view.total - view.visibleRows / 2)))
  }
  const nearPin = (e: React.PointerEvent) => {
    const y = yOf(e), x = e.clientX - host.current!.getBoundingClientRect().left
    return pins.current.find((p) => Math.abs(p.y - y) < FLAG_REACH && x < (phone ? 20 : 18))
  }

  const describe = (e: React.PointerEvent) => {
    const near = nearPin(e)
    const y = yOf(e)
    const H = host.current?.clientHeight || 1
    if (near) { setTip({ y, text: near.mark.name, sub: near.mark.text.split('\n').find((l) => l.trim())?.trim().slice(0, 40) }); return }
    const line = Math.round((y / H) * view.total)
    setTip({ y, text: `Line ${line.toLocaleString()} of ${view.total.toLocaleString()}` })
  }

  const down = (e: React.PointerEvent) => {
    if (e.button !== 0) return
    view.touchRail()
    const near = nearPin(e)
    if (near) { onOpenMark(near.mark); return }
    setDrag(true)
    host.current!.setPointerCapture(e.pointerId)
    seek(yOf(e))
    if (phone) setTip(null)
  }
  const move = (e: React.PointerEvent) => {
    if (drag) seek(yOf(e))
    if (!phone) describe(e)
  }
  const up = () => setDrag(false)
  const key = (e: React.KeyboardEvent) => {
    const step = e.key === 'PageUp' || e.key === 'PageDown' ? view.visibleRows : 3
    const row = view.reading ? view.top : Math.max(view.total - view.visibleRows, 0)
    if (e.key === 'ArrowUp' || e.key === 'PageUp') { e.preventDefault(); view.openAt(row - step) }
    else if (e.key === 'ArrowDown' || e.key === 'PageDown') { e.preventDefault(); view.openAt(row + step) }
    else if (e.key === 'Home') { e.preventDefault(); view.openAt(0) }
    else if (e.key === 'End') { e.preventDefault(); view.back() }
  }

  return (
    <div ref={host} role="slider" aria-label="Position in the session history" tabIndex={0} aria-orientation="vertical"
      aria-valuemin={0} aria-valuemax={view.total} aria-valuenow={view.reading ? view.top : view.total}
      onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up} onLostPointerCapture={up}
      onPointerEnter={() => view.touchRail()} onPointerLeave={() => setTip(null)} onKeyDown={key}
      className={`relative shrink-0 cursor-ns-resize touch-none border-l border-line bg-sidebar outline-none
        focus-visible:ring-1 focus-visible:ring-focus ${phone ? 'w-9' : 'w-[76px]'}`}>
      <canvas ref={canvas} className="absolute inset-0 block size-full" />
      {tip && !phone && (
        <div className="pointer-events-none absolute right-[84px] z-10 max-w-[240px] rounded-md bg-raised px-2 py-1 text-xs whitespace-nowrap shadow-[var(--shadow-menu)]"
          style={{ top: Math.max(6, Math.min(tip.y - 14, (host.current?.clientHeight ?? 60) - 46)) }}>
          <div className="truncate font-semibold">{tip.text}</div>
          {tip.sub && <div className="truncate font-mono text-[11px] text-dim">{tip.sub}</div>}
        </div>
      )}
    </div>
  )
}
