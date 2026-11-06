import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react'

import { engine, open } from './engine'
import type { Found } from './FindBox'
import type { PdfTarget } from './index'
import { jump } from './jump'
import type { Live } from './live'
import type { Narrator } from './narrator'
import { FITS, places, type Scale } from './zoom'

type Options = {
  scroller: RefObject<HTMLDivElement | null>
  inner: RefObject<HTMLDivElement | null>
  mem: RefObject<{ memory?: string; start: string }>
  data: Uint8Array | null
  reader?: Narrator
  target?: PdfTarget | null
  focused: boolean
  onFound: (f: Found) => void
}

/** The pdf.js viewer: made once, each new set of bytes loaded into it keeping zoom and scroll, SyncTeX targets. */
export function useViewer({ scroller, inner, mem, data, reader, target, focused, onFound }: Options) {
  const live = useRef<Live | null>(null)
  const restoring = useRef(false)
  const pending = useRef<PdfTarget | null>(null)
  const [ready, setReady] = useState(false)
  const [pages, setPages] = useState(0)
  const [page, setPage] = useState(1)
  const [pageText, setPageText] = useState('1')
  const [scale, setScale] = useState<Scale>({ value: 'page-width', percent: 100 })
  const [failed, setFailed] = useState('')

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
        state?: number }) => m && onFound({ current: m.current, total: m.total, missing: state === 1 })
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
  }, [mem, scroller, inner, onFound])

  useEffect(() => {
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

  useEffect(() => {  // SyncTeX: scroll to a spot and flash it
    const me = live.current
    if (!target) return
    if (!me?.doc || restoring.current) { pending.current = target; return }
    jump(me.viewer, target)
  }, [target])

  const zoom = (value: string) => { if (live.current?.doc) live.current.viewer.currentScaleValue = value }
  const toPage = () => {
    const n = Math.max(1, Math.min(pages, Number(pageText) || page))
    if (live.current?.doc) live.current.viewer.currentPageNumber = n
    setPageText(String(n))
  }

  return { live, restoring, ready, pages, page, pageText, setPageText, toPage, scale, zoom, failed }
}
