// pdf.js's viewer in React: pages one after another, zoom, fit width, search, text selection, and SyncTeX
// double-clicks. New bytes reload in place: zoom and scroll stay where they were.
import 'pdfjs-dist/web/pdf_viewer.css'
import './pdf.css'

import { ChevronDown, ChevronUp, Minus, Moon, Plus, Search, Sun, X } from 'lucide-react'
import { useEffect, useRef, useState, type ReactNode } from 'react'

import { Spinner } from '../ui'
import { engine, open } from './engine'
import type { PdfProps, PdfTarget } from './index'

type Engine = Awaited<ReturnType<typeof engine>>
type Live = {
  lib: Engine['lib']
  viewer: InstanceType<Engine['viewer']['PDFViewer']>
  bus: InstanceType<Engine['viewer']['EventBus']>
  link: InstanceType<Engine['viewer']['PDFLinkService']>
  doc: Awaited<ReturnType<Engine['lib']['getDocument']>['promise']> | null
}
type Found = { current: number; total: number; missing: boolean }

// Zoom and scroll by memory name: survive reloads and leaving the page
const places = new Map<string, { scale: string; top: number; left: number }>()
const ZOOMS: [string, string][] = [['auto', 'Automatic'], ['page-width', 'Fit width'], ['page-fit', 'Fit page'],
  ['0.5', '50%'], ['0.75', '75%'], ['1', '100%'], ['1.25', '125%'], ['1.5', '150%'], ['2', '200%'], ['3', '300%']]

function stored(key: string): boolean {
  try { return localStorage.getItem(key) === '1' } catch { return false }
}

function Tool({ label, onClick, children, on = false, disabled = false }:
  { label: string; onClick: () => void; children: ReactNode; on?: boolean; disabled?: boolean }) {
  return (
    <button aria-label={label} title={label} onClick={onClick} disabled={disabled}
      className={`grid size-7 shrink-0 place-items-center rounded-md disabled:opacity-40 ${
        on ? 'bg-selected' : 'hover:bg-hover'}`}>{children}</button>
  )
}

export default function PdfViewer({ data, memory, compact, zoom: start = 'page-width', loading, progress, message, onSync, target, extra }:
  PdfProps) {
  const scroller = useRef<HTMLDivElement>(null)
  const inner = useRef<HTMLDivElement>(null)
  const live = useRef<Live | null>(null)
  const restoring = useRef(false)
  const pending = useRef<PdfTarget | null>(null)
  const sync = useRef(onSync)
  sync.current = onSync
  const mem = useRef({ memory, start })
  mem.current = { memory, start }
  const [ready, setReady] = useState(false)
  const [pages, setPages] = useState(0)
  const [page, setPage] = useState(1)
  const [pageText, setPageText] = useState('1')
  const [scale, setScale] = useState({ value: 'page-width', percent: 100 })
  const [searching, setSearching] = useState(false)
  const [query, setQuery] = useState('')
  const [found, setFound] = useState<Found | null>(null)
  const [dark, setDark] = useState(() => stored('pdf.dark'))
  const [failed, setFailed] = useState('')
  const queryBox = useRef<HTMLInputElement>(null)

  // -- the viewer, made once ---------------------------------------------------------------
  useEffect(() => {
    let dead = false
    engine().then(({ lib, viewer: V }) => {
      if (dead || !scroller.current || !inner.current) return
      const bus = new V.EventBus()
      const link = new V.PDFLinkService({ eventBus: bus, externalLinkTarget: V.LinkTarget.BLANK })
      const findController = new V.PDFFindController({ eventBus: bus, linkService: link })
      const viewer = new V.PDFViewer({ container: scroller.current, viewer: inner.current, eventBus: bus,
        linkService: link, findController, textLayerMode: 1, annotationMode: lib.AnnotationMode.ENABLE,
        annotationEditorMode: lib.AnnotationEditorType.DISABLE })
      link.setViewer(viewer)
      const me: Live = { lib, viewer, bus, link, doc: null }
      bus.on('pagesinit', () => {
        const at = mem.current.memory ? places.get(mem.current.memory) : undefined
        viewer.currentScaleValue = at?.scale ?? mem.current.start
        if (at && scroller.current) { scroller.current.scrollTop = at.top; scroller.current.scrollLeft = at.left }
        restoring.current = false
        if (pending.current) jump(me, pending.current)
        pending.current = null
      })
      bus.on('pagechanging', ({ pageNumber }: { pageNumber: number }) => {
        setPage(pageNumber)
        setPageText(String(pageNumber))
      })
      bus.on('scalechanging', ({ scale: s, presetValue }: { scale: number; presetValue?: string }) =>
        setScale({ value: presetValue ?? String(s), percent: Math.round(s * 100) }))
      const count = ({ matchesCount: m, state }: { matchesCount?: { current: number; total: number };
        state?: number }) => m && setFound({ current: m.current, total: m.total, missing: state === 1 })
      bus.on('updatefindmatchescount', count)
      bus.on('updatefindcontrolstate', count)
      live.current = me
      setReady(true)
    }).catch((e: Error) => setFailed(`Could not start the PDF viewer: ${e.message}`))
    return () => {
      dead = true
      live.current?.doc?.loadingTask.destroy()
      live.current = null
    }
  }, [])

  // -- new bytes: load them, keeping where you were ----------------------------------------
  useEffect(() => {
    const me = live.current
    if (!ready || !me || !data) return
    let dead = false
    setFailed('')
    restoring.current = true
    const task = open(me.lib, data)
    task.promise.then((doc) => {
      if (dead) { task.destroy(); return }
      const old = me.doc
      me.doc = doc
      me.viewer.setDocument(doc)
      me.link.setDocument(doc, null)
      setPages(doc.numPages)
      old?.loadingTask.destroy()
    }).catch((e: Error) => { if (!dead) { restoring.current = false; setFailed(e.message) } })
    return () => { dead = true }
  }, [ready, data])

  // -- remember zoom and scroll; refit when the pane changes size --------------------------
  useEffect(() => {
    const el = scroller.current
    if (!el || !ready) return
    const save = () => {
      const me = live.current
      if (mem.current.memory && me?.doc && !restoring.current) {
        places.set(mem.current.memory, { scale: me.viewer.currentScaleValue, top: el.scrollTop, left: el.scrollLeft })
      }
    }
    let frame = 0
    const resized = new ResizeObserver(() => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => {
        const v = live.current?.viewer
        if (v?.pdfDocument && ['page-width', 'page-fit', 'auto'].includes(v.currentScaleValue)) {
          v.currentScaleValue = v.currentScaleValue  // fit again to the new size
        }
      })
    })
    resized.observe(el)
    const wheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return
      e.preventDefault()
      live.current?.viewer.updateScale({ steps: e.deltaY < 0 ? 1 : -1, origin: [e.clientX, e.clientY] })
    }
    const dbl = (e: MouseEvent) => {
      const me = live.current
      const el = (e.target as HTMLElement).closest('.page') as HTMLElement | null
      if (!sync.current || !me || !el) return
      const n = Number(el.dataset.pageNumber)
      const view = me.viewer.getPageView(n - 1)
      if (!view?.viewport) return
      const r = el.getBoundingClientRect()
      const [px, py] = view.viewport.convertToPdfPoint(e.clientX - r.left - el.clientLeft,
        e.clientY - r.top - el.clientTop)
      const box = view.viewport.viewBox
      window.getSelection()?.removeAllRanges()
      sync.current(n, px - box[0], box[3] - py)
    }
    el.addEventListener('scroll', save, { passive: true })
    el.addEventListener('wheel', wheel, { passive: false })
    el.addEventListener('dblclick', dbl)
    return () => {
      el.removeEventListener('scroll', save)
      el.removeEventListener('wheel', wheel)
      el.removeEventListener('dblclick', dbl)
      resized.disconnect()
      cancelAnimationFrame(frame)
    }
  }, [ready])

  // -- SyncTeX: scroll to a spot and flash it ----------------------------------------------
  useEffect(() => {
    const me = live.current
    if (!target) return
    if (!me?.doc || restoring.current) { pending.current = target; return }
    jump(me, target)
  }, [target])

  // -- search --------------------------------------------------------------------------------
  const find = (type: '' | 'again', previous = false, q = query) => live.current?.bus.dispatch('find', {
    source: null, type, query: q, caseSensitive: false, entireWord: false, highlightAll: true,
    findPrevious: previous, matchDiacritics: false })
  const openSearch = () => {
    setSearching(true)
    requestAnimationFrame(() => queryBox.current?.select())
  }
  const closeSearch = () => {
    setSearching(false)
    setFound(null)
    live.current?.bus.dispatch('findbarclose', { source: null })
    scroller.current?.focus()
  }
  const keys = (e: React.KeyboardEvent) => {
    const mod = e.ctrlKey || e.metaKey
    if (mod && e.key === 'f') { e.preventDefault(); openSearch() }
    else if (mod && (e.key === '=' || e.key === '+')) { e.preventDefault(); live.current?.viewer.increaseScale() }
    else if (mod && e.key === '-') { e.preventDefault(); live.current?.viewer.decreaseScale() }
    else if (e.key === 'Escape' && searching) closeSearch()
  }

  const zoom = (value: string) => { if (live.current?.doc) live.current.viewer.currentScaleValue = value }
  const toPage = () => {
    const n = Math.max(1, Math.min(pages, Number(pageText) || page))
    if (live.current?.doc) live.current.viewer.currentPageNumber = n
    setPageText(String(n))
  }
  const toggleDark = () => {
    setDark(!dark)
    try { localStorage.setItem('pdf.dark', dark ? '0' : '1') } catch { /* private window */ }
  }

  const has = !!data && !failed && !message
  const preset = ZOOMS.some(([v]) => v === scale.value)
  return (
    <div className="flex h-full min-w-0 flex-col bg-view" onKeyDown={keys}>
      <div className="flex h-10 shrink-0 items-center gap-1 border-b border-line bg-header px-1.5 text-[13px]">
        <div className="flex items-center gap-1 px-1 tabular-nums text-dim">
          <input value={pageText} disabled={!has} aria-label="Page"
            onChange={(e) => setPageText(e.target.value.replace(/\D/g, ''))}
            onKeyDown={(e) => e.key === 'Enter' && toPage()} onBlur={toPage}
            className="h-7 w-9 rounded-md bg-pill text-center text-text outline-none focus:ring-2 focus:ring-accent" />
          <span className="whitespace-nowrap">/ {has ? pages || '…' : '…'}</span>
        </div>
        <div className="mx-auto flex items-center gap-0.5">
          <Tool label="Zoom out (Ctrl+-)" disabled={!has} onClick={() => live.current?.viewer.decreaseScale()}>
            <Minus size={15} /></Tool>
          <select value={preset ? scale.value : 'custom'} disabled={!has} aria-label="Zoom"
            onChange={(e) => zoom(e.target.value)}
            className={`h-7 rounded-md bg-pill px-1.5 text-[13px] outline-none ${compact ? 'w-[86px]' : 'w-[98px]'}`}>
            {!preset && <option value="custom">{scale.percent}%</option>}
            {ZOOMS.map(([v, label]) => <option key={v} value={v}>{label}</option>)}
          </select>
          <Tool label="Zoom in (Ctrl++)" disabled={!has} onClick={() => live.current?.viewer.increaseScale()}>
            <Plus size={15} /></Tool>
        </div>
        <Tool label="Search (Ctrl+F)" on={searching} disabled={!has}
          onClick={() => searching ? closeSearch() : openSearch()}><Search size={15} /></Tool>
        {!compact && <Tool label={dark ? 'Light pages' : 'Dark pages'} on={dark} onClick={toggleDark}>
          {dark ? <Sun size={15} /> : <Moon size={15} />}</Tool>}
        {extra}
      </div>
      <div className="relative min-h-0 flex-1">
        <div ref={scroller} tabIndex={0}
          className={`pdf-scroll ${dark ? 'pdf-dark' : ''} ${compact ? 'pdf-compact' : ''} ${has ? '' : 'invisible'}`}>
          <div ref={inner} className="pdfViewer" />
        </div>
        {searching && (
          <div className="absolute right-3 top-2 z-10 flex items-center gap-1 rounded-xl border border-line bg-window
            p-1 shadow-lg">
            <input ref={queryBox} autoFocus value={query} placeholder="Find in PDF" aria-label="Find in PDF"
              onChange={(e) => { setQuery(e.target.value); find('', false, e.target.value) }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') { e.preventDefault(); find('again', e.shiftKey) }
                if (e.key === 'Escape') { e.stopPropagation(); closeSearch() }
              }}
              className={`h-7 rounded-md bg-pill px-2 text-[13px] outline-none focus:ring-2 focus:ring-accent ${
                compact ? 'w-28' : 'w-44'} ${found?.missing && query ? 'ring-2 ring-bad' : ''}`} />
            <span className="min-w-[52px] text-center text-[12px] tabular-nums text-dim">
              {query && found ? (found.total ? `${found.current} of ${found.total}` : 'None') : ''}</span>
            <Tool label="Previous (Shift+Enter)" onClick={() => find('again', true)}><ChevronUp size={15} /></Tool>
            <Tool label="Next (Enter)" onClick={() => find('again')}><ChevronDown size={15} /></Tool>
            <Tool label="Close" onClick={closeSearch}><X size={15} /></Tool>
          </div>
        )}
        {!has && (
          <div className="absolute inset-0 grid place-items-center p-6 text-center">
            {message ?? (failed ? <p className="text-[13px] text-bad">Could not open the PDF: {failed}</p>
              : <div className="flex flex-col items-center gap-3 text-[13px] text-dim">
                  <Spinner size={24} />
                  {loading && progress !== undefined && progress > 0 && progress < 1 &&
                    <span className="tabular-nums">{Math.round(progress * 100)}%</span>}
                </div>)}
          </div>
        )}
      </div>
    </div>
  )
}

/** Scroll so the spot sits near the top, and pulse a bar over that line. */
function jump(me: Live, t: PdfTarget) {
  const view = me.viewer.getPageView(t.page - 1)
  if (!view?.viewport) return
  const box = view.viewport.viewBox
  me.viewer.scrollPageIntoView({ pageNumber: t.page, destArray: [null, { name: 'XYZ' }, box[0], box[3] - t.y + 72,
    null], allowNegativeOffset: true, ignoreDestinationZoom: true })
  const [, cy] = view.viewport.convertToViewportPoint(t.x + box[0], box[3] - t.y)
  const s = view.viewport.scale
  const mark = document.createElement('div')
  mark.className = 'pdf-mark'
  Object.assign(mark.style, { left: `${54 * s}px`, right: `${54 * s}px`, top: `${cy - 10 * s}px`,
    height: `${13 * s}px` })
  view.div.querySelectorAll('.pdf-mark').forEach((m: Element) => m.remove())
  view.div.appendChild(mark)
  setTimeout(() => mark.remove(), 2000)
}
