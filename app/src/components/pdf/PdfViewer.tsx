import 'pdfjs-dist/web/pdf_viewer.css'
import './pdf.css'

import { useEffect, useRef, useState } from 'react'

import { FindBox, type Found } from './FindBox'
import { FocusOverlay } from './FocusOverlay'
import type { PdfProps } from './index'
import { PdfStatus } from './PdfStatus'
import { PdfToolbar } from './PdfToolbar'
import { store, stored } from './storage'
import { useFocus } from './useFocus'
import { useFocusKeys } from './useFocusKeys'
import { useLatest } from './useLatest'
import { useNoJump } from './useNoJump'
import { usePaneEvents } from './usePaneEvents'
import { useViewer } from './useViewer'
import { useWordEvents } from './useWordEvents'

export default function PdfViewer({ data, memory, compact, zoom: start = 'page-width', loading, progress, message, onSync,
  target, extra, reader, onWord, onLookUp, bar, footer, focus, onFocus }: PdfProps) {
  const scroller = useRef<HTMLDivElement>(null)
  const inner = useRef<HTMLDivElement>(null)
  const sync = useLatest(onSync)
  const picked = useLatest(onWord)
  const looked = useLatest(onLookUp)
  const mem = useLatest({ memory, start })
  const [searching, setSearching] = useState(false)
  const [query, setQuery] = useState('')
  const [found, setFound] = useState<Found | null>(null)
  const [dark, setDark] = useState(() => stored('pdf.dark', '0') === '1')
  const queryBox = useRef<HTMLInputElement>(null)
  const [focused, setFocused] = useFocus(focus, onFocus)
  const focusKey = useFocusKeys(focused, setFocused)
  useNoJump(scroller, inner, focused)
  const { live, restoring, ready, pages, page, pageText, setPageText, toPage, scale, zoom, failed } =
    useViewer({ scroller, inner, mem, data, reader, target, focused, onFound: setFound })
  useWordEvents(ready, reader, { live, scroller, onWord: picked, onLookUp: looked, onSync: sync })
  usePaneEvents(scroller, live, restoring, mem, sync, ready)

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

  const toggleDark = () => {
    setDark(!dark)
    store('pdf.dark', dark ? '0' : '1')
  }

  return (
    <div className="flex h-full min-w-0 flex-col bg-view" onKeyDown={keys}>
      <PdfToolbar has={has} compact={compact} hidden={focused} pages={pages} pageText={pageText}
        onPageText={setPageText} onPage={toPage} scale={scale} onZoom={zoom}
        onZoomIn={() => live.current?.viewer.increaseScale()} onZoomOut={() => live.current?.viewer.decreaseScale()}
        searching={searching} onSearch={() => searching ? closeSearch() : openSearch()}
        dark={dark} onDark={toggleDark} extra={extra} onFocus={() => has && setFocused(true)} />
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
        {!has && <PdfStatus message={message} failed={failed} loading={loading} progress={progress} />}
      </div>
      {!focused && footer}
    </div>
  )
}
