// A calm copy of the session's history over the live terminal: lines from tmux, read a window at a time, so you can
// scroll and mark without touching the running session. The terminal underneath keeps going.
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'

import { onThemeChange } from '../../../theme'
import type { Tab } from '../tabs'
import { theme } from '../xterm'
import type { Row } from './sgr'
import type { HistoryView } from './view'

const OVERSCAN = 30
const LONG_PRESS = 430
const MOVE_SLOP = 8
const SCROLL_MS = 400
const TYPED = (key: string) => key.length === 1 ? key : key === 'Enter' ? '\r' : key === 'Backspace' ? '\x7f' : ''

export const rowHeight = (phone: boolean) => phone ? 16 : 18

function Line({ row, y, top, phone, marked, first, last, name, onGutter, flashAt }: {
  row: Row | undefined; y: number; top: number; phone: boolean; marked: boolean; first: boolean; last: boolean
  name: string; onGutter?: (y: number) => void; flashAt: number | null
}) {
  const el = useRef<HTMLDivElement>(null)
  useLayoutEffect(() => {
    if (flashAt === null || !el.current) return
    el.current.animate([{ backgroundColor: 'var(--color-accent-soft)', outline: '1px solid var(--color-accent)' },
      { backgroundColor: 'transparent', outline: '1px solid transparent' }], { duration: 1100, easing: 'ease-out' })
  }, [flashAt])
  const h = rowHeight(phone)
  const box = marked ? `inset 0 ${first ? 1 : 0}px 0 var(--color-accent), inset 0 ${last ? -1 : 0}px 0 var(--color-accent)` : undefined
  return (
    <div ref={el} data-y={y} className={`group absolute left-0 whitespace-pre ${marked ? 'bg-accent-soft' : ''}`}
      style={{ top, height: h, lineHeight: `${h}px`, right: 0, paddingLeft: phone ? 8 : 20, paddingRight: 8, boxShadow: box }}>
      {onGutter && row?.plain.trim() && (
        <button aria-label="Mark this" tabIndex={-1} onClick={() => onGutter(y)}
          className={`absolute top-0 left-0 grid h-full w-[18px] place-items-center text-[10px] leading-none
            ${marked ? 'text-accent' : 'text-transparent group-hover:text-dim hover:text-accent!'}`}>
          {first || !marked ? '●' : ''}
        </button>
      )}
      {row?.spans.map((s, i) => <span key={i} style={s.style}>{s.text}</span>)}
      {first && name && (
        <span className="pointer-events-none absolute top-0 right-2 max-w-[45%] truncate rounded-sm bg-accent px-1.5 font-sans text-[11px] leading-4 font-semibold text-on-accent">
          {name}
        </span>
      )}
    </div>
  )
}

export function ReadingView({ view, tab, phone, onMark }: { view: HistoryView; tab: Tab; phone: boolean
  onMark: (row: number) => void }) {
  const box = useRef<HTMLDivElement>(null)
  const [, setTick] = useState(0)
  const h = rowHeight(phone)
  const fontSize = phone ? 12 : Number(tab.term.options.fontSize) || 14

  useEffect(() => onThemeChange(() => setTick((n) => n + 1)), [])

  // jumps move the view; the view's own scroll events don't (that would fight your finger)
  useLayoutEffect(() => {
    const el = box.current
    if (el) { el.scrollTop = view.top * h; setTick((n) => n + 1) }
  }, [view.jumps, h, view])

  useEffect(() => {
    const el = box.current!
    const measure = () => {
      if (el.clientHeight > 0) { view.visibleRows = Math.max(3, Math.ceil(el.clientHeight / h)); view.ensure() }
    }
    measure()
    const watch = new ResizeObserver(measure)
    watch.observe(el)
    el.focus({ preventScroll: true })
    return () => watch.disconnect()
  }, [view, h])

  const moved = useRef(0)  // when you last scrolled by hand: a jump to something near the end must not close this
  const before = useRef(0)
  const atEnd = (el: HTMLElement) => el.scrollHeight - el.scrollTop - el.clientHeight <= h
  const onScroll = useCallback(() => {
    const el = box.current
    if (!el) return
    const down = el.scrollTop > before.current
    before.current = el.scrollTop
    if (down && Date.now() - moved.current < SCROLL_MS && atEnd(el)) return view.back()  // back at the end: live again
    view.scrolled(Math.max(0, Math.floor(el.scrollTop / h)))
    setTick((n) => n + 1)
  }, [view, h])  // eslint-disable-line react-hooks/exhaustive-deps
  const wheel = (e: React.WheelEvent) => {
    moved.current = Date.now()
    if (e.deltaY > 0 && box.current && atEnd(box.current)) view.back()
  }

  // the line nearest the middle of the screen that has something on it
  const center = () => {
    const mid = view.top + Math.floor(view.visibleRows / 2)
    for (let d = 0; d <= view.visibleRows; d++) {
      for (const y of [mid + d, mid - d]) if (view.isBlank(y) === false) return y
    }
    return mid
  }
  const key = (e: React.KeyboardEvent) => {
    const plain = !e.ctrlKey && !e.metaKey && !e.altKey
    if (['ArrowDown', 'PageDown', 'End', ' '].includes(e.key)) moved.current = Date.now()
    if (e.key === 'Escape') { e.preventDefault(); view.back() }
    else if (e.key.toLowerCase() === 'm' && plain) { e.preventDefault(); onMark(center()) }
    else if (plain && TYPED(e.key) && e.key !== ' ') {  // typing goes to the terminal, which comes back to take it
      e.preventDefault()
      view.back()
      tab.term.input(TYPED(e.key))
    }
  }

  // a long press on a line is the phone's way to mark it
  const press = useRef<{ x: number; y: number; timer: ReturnType<typeof setTimeout> } | null>(null)
  const pointerDown = (e: React.PointerEvent) => {
    if (!phone || e.button !== 0) return
    const line = (e.target as HTMLElement).closest<HTMLElement>('[data-y]')
    if (!line) return
    const y = Number(line.dataset.y)
    const timer = setTimeout(() => { press.current = null; navigator.vibrate?.(10); onMark(y) }, LONG_PRESS)
    press.current = { x: e.clientX, y: e.clientY, timer }
  }
  const cancelPress = () => { if (press.current) { clearTimeout(press.current.timer); press.current = null } }
  const pointerMove = (e: React.PointerEvent) => {
    const p = press.current
    if (p && Math.abs(e.clientX - p.x) + Math.abs(e.clientY - p.y) > MOVE_SLOP) cancelPress()
  }

  const first = Math.max(0, view.top - OVERSCAN)
  const last = Math.min(view.total - 1, view.top + view.visibleRows + OVERSCAN)
  const lines: number[] = []
  for (let y = first; y <= last; y++) lines.push(y)
  const flashAt = view.flash && Date.now() - view.flash.at < 1200 ? view.flash.row : null
  const t = theme()
  const anyLoaded = lines.some((y) => view.rowAt(y))
  const live = view.marks.filter((m) => m.live)

  return (
    <div ref={box} tabIndex={0} role="region" aria-label="Session history" onScroll={onScroll} onKeyDown={key} onWheel={wheel}
      onTouchMove={() => { moved.current = Date.now() }}
      onPointerDown={pointerDown} onPointerMove={pointerMove} onPointerUp={cancelPress} onPointerCancel={cancelPress}
      onContextMenu={(e) => { if (phone) e.preventDefault() }}
      className={`absolute inset-0 z-[5] overflow-auto overscroll-contain outline-none [scrollbar-width:none]
        ${phone ? 'select-none [touch-action:pan-x_pan-y]' : 'select-text'}`}
      style={{ background: t.background as string, color: t.foreground as string, outline: 'none',
        fontFamily: tab.term.options.fontFamily, fontSize }}>
      <div className="relative" style={{ height: Math.max(view.total * h, 1) }}>
        {lines.map((y) => {
          const m = live.find((mk) => y >= mk.line && y < mk.line + mk.rows)
          return <Line key={y} y={y} top={y * h} phone={phone} row={view.rowAt(y)} marked={!!m}
            first={!!m && m.line === y} last={!!m && m.line + m.rows - 1 === y} name={m && m.line === y ? m.name : ''}
            onGutter={phone ? undefined : onMark} flashAt={flashAt === y ? view.flash!.at : null} />
        })}
      </div>
      {!anyLoaded && (
        <div className="pointer-events-none absolute inset-0 grid place-items-center text-sm text-dim">Reading the history</div>
      )}
    </div>
  )
}
