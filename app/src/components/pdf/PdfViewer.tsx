import 'pdfjs-dist/web/pdf_viewer.css'
import './pdf.css'

import { Minus, Moon, Plus, Search, Sun } from 'lucide-react'
import { useEffect, useLayoutEffect, useRef, useState } from 'react'

import { Spinner } from '../ui'
import { engine, open } from './engine'
import { FindBox, type Found } from './FindBox'
import { useFocus, useFocusKeys, useNoJump } from './focus'
import { FocusButton } from './FocusButton'
import { FocusOverlay } from './FocusOverlay'
import type { PdfProps, PdfTarget } from './index'
import { jump } from './jump'
import type { Live } from './live'
import { spotAt } from './points'
import { store, stored } from './storage'
import { Tool } from './tool'
import { useLatest } from './useLatest'
import { useWordEvents } from './useWordEvents'

const places = new Map<string, { scale: string; top: number; left: number }>()  // by memory name
const FITS = ['page-width', 'page-fit', 'auto']
const ZOOMS: [string, string][] = [['auto', 'Automatic'], ['page-width', 'Fit width'], ['page-fit', 'Fit page'],
  ['0.5', '50%'], ['0.75', '75%'], ['1', '100%'], ['1.25', '125%'], ['1.5', '150%'], ['2', '200%'], ['3', '300%']]

export default function PdfViewer({ data, memory, compact, zoom: start = 'page-width', loading, progress, message, onSync,
  target, extra, reader, onWord, onLookUp, bar, footer, focus, onFocus }: PdfProps) {
  const scroller = useRef<HTMLDivElement>(null)
  const inner = useRef<HTMLDivElement>(null)
  const live = useRef<Live | null>(null)
  const restoring = useRef(false)
  const pending = useRef<PdfTarget | null>(null)
  const sync = useLatest(onSync)
  const picked = useLatest(onWord)
  const looked = useLatest(onLookUp)
  const mem = useLatest({ memory, start })
  const [ready, setReady] = useState(false)
  const [pages, setPages] = useState(0)
  const [page, setPage] = useState(1)
  const [pageText, setPageText] = useState('1')
  const [scale, setScale] = useState({ value: 'page-width', percent: 100 })
  const [searching, setSearching] = useState(false)
  const [query, setQuery] = useState('')
  const [found, setFound] = useState<Found | null>(null)
  const [dark, setDark] = useState(() => stored('pdf.dark', '0') === '1')
  const [failed, setFailed] = useState('')
  const queryBox = useRef<HTMLInputElement>(null)
  const [focused, setFocused] = useFocus(focus, onFocus)
  const focusKey = useFocusKeys(focused, setFocused)
  useNoJump(scroller, inner, focused)
  useWordEvents(ready, reader, { live, scroller, onWord: picked, onLookUp: looked, onSync: sync })

  const fit = useRef<string | null>(null)
  useLayoutEffect(() => {  // the pane may widen in focus: keep the zoom, so the page stays put
    const v = live.current?.viewer
    if (!v?.pdfDocument) return
    if (focused && FITS.includes(v.currentScaleValue)) {
      fit.current = v.currentScaleValue
      v.currentScaleValue = String(v.currentScale)
    } else if (!focused && fit.current) {
      v.currentScaleValue = fit.current
      fit.current = null
    }
  }, [focused])

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
        if (pending.current) jump(viewer, pending.current)
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
  }, [mem])

  useEffect(() => {  // new bytes: load them, keeping zoom and scroll
    const me = live.current
    if (!ready || !me || !data) return
    let dead = false
    setFailed('')
    reader?.reset()
    restoring.current = true
    const task = open(me.lib, data)
    task.promise.then((doc) => {
      if (dead) { task.destroy(); return }
      const old = me.doc
      me.doc = doc
      me.viewer.setDocument(doc)
      me.link.setDocument(doc, null)
      reader?.setDocument?.(doc)
      setPages(doc.numPages)
      old?.loadingTask.destroy()
    }).catch((e: Error) => { if (!dead) { restoring.current = false; setFailed(e.message) } })
    return () => { dead = true }
  }, [ready, data])  // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {  // remember zoom and scroll; fit again when the pane changes size; ctrl+wheel; SyncTeX
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
        const value = v?.currentScaleValue
        if (v?.pdfDocument && value && FITS.includes(value)) v.currentScaleValue = value
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
      if (!sync.current || !me) return
      const spot = spotAt(me.viewer, e.clientX, e.clientY, e.target)
      if (!spot) return
      window.getSelection()?.removeAllRanges()
      sync.current(spot.page, spot.x, spot.y)
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
  }, [ready, mem, sync])

  useEffect(() => {  // SyncTeX: scroll to a spot and flash it
    const me = live.current
    if (!target) return
    if (!me?.doc || restoring.current) { pending.current = target; return }
    jump(me.viewer, target)
  }, [target])

  const has = !!data && !failed && !message
  const find = (type: '' | 'again', previous = false, q = query) => live.current?.bus.dispatch('find', {
    source: null, type, query: q, caseSensitive: false, entireWord: false, highlightAll: true,
    findPrevious: previous, matchDiacritics: false })
  const openSearch = () => {
    setSearching(true)
    queryBox.current?.select()  // already open: pick the words, to type new ones
  }
  useEffect(() => { if (searching) queryBox.current?.select() }, [searching])
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
    else if (!compact && has) focusKey(e)
  }

  const zoom = (value: string) => { if (live.current?.doc) live.current.viewer.currentScaleValue = value }
  const toPage = () => {
    const n = Math.max(1, Math.min(pages, Number(pageText) || page))
    if (live.current?.doc) live.current.viewer.currentPageNumber = n
    setPageText(String(n))
  }
  const toggleDark = () => {
    setDark(!dark)
    store('pdf.dark', dark ? '0' : '1')
  }

  const preset = ZOOMS.some(([v]) => v === scale.value)
  return (
    <div className="flex h-full min-w-0 flex-col bg-view" onKeyDown={keys}>
      <div className={`flex h-10 shrink-0 items-center gap-1 border-b border-line bg-header px-1.5 text-sm pointer-coarse:h-14 pointer-coarse:overflow-x-auto ${
        focused ? 'hidden' : ''}`}>
        <div className="flex items-center gap-1 px-1 tabular-nums text-dim">
          <input value={pageText} disabled={!has} aria-label="Page"
            onChange={(e) => setPageText(e.target.value.replace(/\D/g, ''))}
            onKeyDown={(e) => e.key === 'Enter' && toPage()} onBlur={toPage}
            className="h-7 w-9 rounded-md bg-pill text-center pointer-coarse:h-11 text-text outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-focus" />
          <span className="whitespace-nowrap">/ {has ? pages || '…' : '…'}</span>
        </div>
        <div className="mx-auto flex items-center gap-0.5">
          <Tool label="Zoom out (Ctrl+-)" disabled={!has} onClick={() => live.current?.viewer.decreaseScale()}>
            <Minus size={16} /></Tool>
          <select value={preset ? scale.value : 'custom'} disabled={!has} aria-label="Zoom"
            onChange={(e) => zoom(e.target.value)}
            className={`h-7 rounded-md bg-pill px-1.5 text-sm outline-none pointer-coarse:h-11 pointer-coarse:w-[116px] ${compact ? 'w-[86px]' : 'w-[98px]'}`}>
            {!preset && <option value="custom">{scale.percent}%</option>}
            {ZOOMS.map(([v, label]) => <option key={v} value={v}>{label}</option>)}
          </select>
          <Tool label="Zoom in (Ctrl++)" disabled={!has} onClick={() => live.current?.viewer.increaseScale()}>
            <Plus size={16} /></Tool>
        </div>
        <Tool label="Search (Ctrl+F)" on={searching} disabled={!has}
          onClick={() => searching ? closeSearch() : openSearch()}><Search size={16} /></Tool>
        {!compact && <Tool label={dark ? 'Light pages' : 'Dark pages'} on={dark} onClick={toggleDark}>
          {dark ? <Sun size={16} /> : <Moon size={16} />}</Tool>}
        {extra}
        {!compact && <FocusButton onClick={() => has && setFocused(true)} />}
      </div>
      {!focused && bar}
      <div className="relative min-h-0 flex-1">
        <div ref={scroller} tabIndex={0}
          className={`pdf-scroll ${dark ? 'pdf-dark' : ''} ${compact ? 'pdf-compact' : ''} ${onWord ? 'pdf-hold' : ''} ${
            has ? '' : 'invisible'}`}>
          <div ref={inner} className="pdfViewer" />
        </div>
        {searching && <FindBox input={queryBox} query={query} found={found} compact={compact}
          onQuery={(q) => { setQuery(q); find('', false, q) }} onStep={(back) => find('again', back)}
          onClose={closeSearch} />}
        {focused && <FocusOverlay what="Just the PDF" page={page} pages={pages} onExit={() => setFocused(false)} />}
        {!has && (
          <div className="absolute inset-0 grid place-items-center p-6 text-center">
            {message ?? (failed ? <p className="text-sm text-bad">Could not open the PDF: {failed}</p>
              : <div className="flex flex-col items-center gap-3 text-sm text-dim">
                  <Spinner size={24} />
                  {loading && progress !== undefined && progress > 0 && progress < 1 &&
                    <span className="tabular-nums">{Math.round(progress * 100)}%</span>}
                </div>)}
          </div>
        )}
      </div>
      {!focused && footer}
    </div>
  )
}
