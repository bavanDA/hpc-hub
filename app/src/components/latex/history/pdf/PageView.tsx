import { Code2 } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'

import { HoverLine } from './HoverLine'
import type { Box, Click, Doc, Drawn, PdfMark, PinAt } from './types'

export function PageView({ doc, n, w, h, scale, targets, root, onSource, pins = [], onPin, onContext }:
  { doc: Doc; n: number; w: number; h: number; scale: number; targets: PdfMark[]
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
