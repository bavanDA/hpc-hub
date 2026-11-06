import '@fontsource/literata/latin-400.css'
import '@fontsource/literata/latin-400-italic.css'
import '@fontsource/literata/latin-600.css'
import '@fontsource/source-serif-4/latin-400.css'
import '@fontsource/source-serif-4/latin-400-italic.css'
import '@fontsource/source-serif-4/latin-600.css'
import '@fontsource/charis-sil/latin-400.css'
import '@fontsource/charis-sil/latin-400-italic.css'
import '@fontsource/charis-sil/latin-700.css'
import '@fontsource/inter/latin-400.css'
import '@fontsource/inter/latin-600.css'
import '@fontsource/atkinson-hyperlegible/latin-400.css'
import '@fontsource/atkinson-hyperlegible/latin-400-italic.css'
import '@fontsource/atkinson-hyperlegible/latin-700.css'
import 'katex/dist/katex.min.css'
import './reader.css'

import { ALargeSmall, List, Maximize, ScrollText, Search } from 'lucide-react'
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'

import { FocusOverlay } from '../pdf/FocusOverlay'
import type { Narrator } from '../pdf/narrator'
import { Tool } from '../pdf/tool'
import { useFocus } from '../pdf/useFocus'
import { useFocusKeys } from '../pdf/useFocusKeys'
import { useLatest } from '../pdf/useLatest'
import { useNoJump } from '../pdf/useNoJump'
import { Spinner } from '../ui/Spinner'
import { BlockView } from './BlockView'
import { Contents } from './Contents'
import { Ctx } from './context'
import { FONTS, SIZES, SPACINGS, WIDTHS } from './look'
import { LookPanel } from './LookPanel'
import { headings, plain } from './model'
import { TextFind } from './TextFind'
import { useLook } from './useLook'
import { usePaper } from './usePaper'

type ReaderProps = {
  data: Uint8Array | null  // the PDF
  latex?: { cluster: string; main: string }  // a LaTeX project: read its source
  memory?: string  // remembers where you were under this name
  narrator?: Narrator  // Read aloud starts on the page you are reading
  aloud?: ReactNode  // the Read aloud button
  bar?: ReactNode  // the Read aloud player, under the bar
  onPages?: () => void  // back to the pages (a plain PDF)
  focus?: boolean
  onFocus?: (on: boolean) => void
}

const places = new Map<string, number>()  // memory name: the block at the top

/** The paper as flowing text, like an e-book, in your own font, size, spacing, width and background. */
export default function Reader({ data, latex, memory, narrator, aloud, bar, onPages, focus, onFocus }: ReaderProps) {
  const [look, setLook] = useLook()
  const { paper, failed } = usePaper(data, latex, !!latex && look.math === 'source')
  const [at, setAt] = useState(0)  // the block at the top of the view
  const [panel, setPanel] = useState<'' | 'look' | 'contents'>('')
  const [searching, setSearching] = useState(false)
  const [query, setQuery] = useState('')
  const [hit, setHit] = useState({ n: 0, total: 0 })
  const [focused, setFocused] = useFocus(focus, onFocus)
  const focusKey = useFocusKeys(focused, setFocused)
  const scroller = useRef<HTMLDivElement>(null)
  const column = useRef<HTMLDivElement>(null)
  const queryBox = useRef<HTMLInputElement>(null)
  useNoJump(scroller, column, focused)

  const blocks = paper?.doc.blocks
  const heads = useMemo(() => headings(blocks ?? []), [blocks])
  const head = heads.findLast((h) => h.i <= at)
  const page = blocks?.[at]?.page ?? 1

  useEffect(() => {  // back to where you were
    const i = memory ? places.get(memory) : undefined
    if (!paper || !i) return
    requestAnimationFrame(() => column.current?.querySelector(`[data-i="${i}"]`)?.scrollIntoView({ block: 'start' }))
  }, [paper, memory])
  useEffect(() => {
    const el = scroller.current
    if (!el || !paper) return
    let frame = 0
    const seen = () => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => {
        const top = el.getBoundingClientRect().top + 8
        const items = column.current?.querySelectorAll<HTMLElement>(':scope > [data-i]') ?? []
        let i = 0
        for (const it of items) { if (it.getBoundingClientRect().bottom > top) { i = Number(it.dataset.i); break } }
        setAt(i)
        if (memory) places.set(memory, i)
      })
    }
    seen()
    el.addEventListener('scroll', seen, { passive: true })
    return () => { el.removeEventListener('scroll', seen); cancelAnimationFrame(frame) }
  }, [paper, memory])
  const pageNow = useLatest(page)
  useEffect(() => narrator?.watchPage(() => pageNow.current) || undefined, [narrator, pageNow])

  const goTo = (i: number) => {
    setPanel('')
    column.current?.querySelector(`[data-i="${i}"]`)?.scrollIntoView({ block: 'start', behavior: 'smooth' })
  }

  useEffect(() => {
    const marks = [...(column.current?.querySelectorAll<HTMLElement>('mark.reader-hit') ?? [])]
    setHit((h) => ({ n: marks.length ? Math.min(h.n, marks.length - 1) : 0, total: marks.length }))
  }, [query, paper, look])
  useEffect(() => {
    const marks = [...(column.current?.querySelectorAll<HTMLElement>('mark.reader-hit') ?? [])]
    marks.forEach((m, k) => { if (k === hit.n) m.dataset.on = '1'; else delete m.dataset.on })
    marks[hit.n]?.scrollIntoView({ block: 'center' })
  }, [hit])
  const step = (back = false) => setHit((h) => ({ ...h, n: h.total ? (h.n + (back ? h.total - 1 : 1)) % h.total : 0 }))
  const openSearch = () => { setSearching(true); requestAnimationFrame(() => queryBox.current?.select()) }
  const closeSearch = () => { setSearching(false); setQuery(''); scroller.current?.focus() }

  const keys = (e: React.KeyboardEvent) => {
    const mod = e.ctrlKey || e.metaKey
    if (mod && e.key === 'f') { e.preventDefault(); openSearch() }
    else if (mod && (e.key === '=' || e.key === '+')) { e.preventDefault(); setLook({ size: Math.min(SIZES.max, look.size + 1) }) }
    else if (mod && e.key === '-') { e.preventDefault(); setLook({ size: Math.max(SIZES.min, look.size - 1) }) }
    else if (e.key === 'Escape' && searching) closeSearch()
    else focusKey(e)
  }

  const font = FONTS.find((f) => f.id === look.font)!
  const ctx = useMemo(() => paper && { doc: paper.doc, pdf: paper.pdf, body: paper.body, query: query.trim() },
    [paper, query])
  return (
    <div className="flex h-full min-w-0 flex-col bg-window" onKeyDown={keys}>
      <div className={`flex h-10 shrink-0 items-center gap-1 border-b border-line bg-header px-1.5 text-sm ${
        focused ? 'hidden' : ''}`}>
        <button onClick={() => setPanel(panel === 'contents' ? '' : 'contents')} disabled={!heads.length}
          aria-expanded={panel === 'contents'} className={`flex h-7 shrink-0 items-center gap-1.5 rounded-md px-2
          font-medium disabled:opacity-40 ${panel === 'contents' ? 'bg-selected' : 'hover:bg-hover'}`}>
          <List size={14} />Contents</button>
        <span className="mx-1 h-[18px] w-px shrink-0 bg-line" />
        <span className="min-w-0 flex-1 truncate text-dim">
          {head && <>{head.b.num && <span className="mr-2 tabular-nums">{head.b.num}</span>}{plain(head.b.c)}</>}</span>
        {paper && paper.pages > 0 && <span className="mr-1.5 shrink-0 whitespace-nowrap tabular-nums text-dim">
          Page {page} of {paper.pages}</span>}
        <Tool label="Search (Ctrl+F)" on={searching} disabled={!paper}
          onClick={() => searching ? closeSearch() : openSearch()}><Search size={16} /></Tool>
        <Tool label="Reading settings" on={panel === 'look'} onClick={() => setPanel(panel === 'look' ? '' : 'look')}>
          <ALargeSmall size={18} /></Tool>
        {aloud}
        {onPages && <Tool label="Show the pages" onClick={onPages}><ScrollText size={16} /></Tool>}
        <Tool label="Full screen (F)" disabled={!paper} onClick={() => setFocused(true)}><Maximize size={16} /></Tool>
      </div>
      {!focused && bar}
      <div className="relative min-h-0 flex-1">
        <div ref={scroller} tabIndex={-1} data-bg={look.bg || undefined}
          className="reader-surface absolute inset-0 overflow-y-auto outline-none">
          {failed ? <p className="p-10 text-center text-sm text-dim">{failed}</p>
            : !paper || !ctx ? <div className="flex h-full flex-col items-center justify-center gap-3 text-sm text-dim">
                <Spinner size={24} />Reading the paper…</div>
            : <div className="reader-pad" style={{ paddingRight: panel === 'look' ? 380 : undefined }}>
                <Ctx.Provider value={ctx}>
                  <div ref={column} className="reader-col" style={{ fontFamily: font.family, fontSize: look.size,
                    lineHeight: SPACINGS[look.spacing], maxWidth: `${WIDTHS[look.width]}em` }}>
                    {paper.note && <p className="reader-note" data-i={0}>{paper.note}</p>}
                    {paper.doc.blocks.map((b, i) => (
                      <div key={i} data-i={i} className="reader-block">
                        {b.page && b.page !== paper.doc.blocks[i - 1]?.page && paper.pages > 0 &&
                          <span className="reader-page">Page {b.page}</span>}
                        <BlockView b={b} />
                      </div>
                    ))}
                  </div>
                </Ctx.Provider>
              </div>}
        </div>
        {panel === 'look' && <LookPanel look={look} set={setLook} hasSource={!!latex} onClose={() => setPanel('')} />}
        {panel === 'contents' && <Contents heads={heads} at={head?.i ?? -1} onGo={goTo} onClose={() => setPanel('')} />}
        {searching && <TextFind input={queryBox} query={query} hit={hit} onStep={step} onClose={closeSearch}
          onQuery={(q) => { setQuery(q); setHit({ n: 0, total: 0 }) }} />}
        {focused && <FocusOverlay what="Full screen" page={page} pages={paper?.pages ?? 0}
          onExit={() => setFocused(false)} />}
      </div>
    </div>
  )
}
