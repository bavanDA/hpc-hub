import { useEffect, useMemo, useRef, useState } from 'react'

import { engine, open } from '../../../pdf/engine'
import { PageView } from './PageView'
import type { Click, Doc, Group, PdfMark, PinAt } from './types'

/** A PDF's pages, one under the other, at the pane's width; marks drawn over the pages that have them. */
export function Pages({ data, zoom, groups = [], focus = null, box, onScroll, onSource, pins = [], onPin, onContext }:
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
    const m = new Map<number, PdfMark[]>()
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
