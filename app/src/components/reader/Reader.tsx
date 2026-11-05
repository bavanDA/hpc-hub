// The Reader: the paper as flowing text, like an e-book, in your own font, size, spacing, width and background.
// A LaTeX paper is read from its source (math typeset with KaTeX); any other PDF, or with Math set to Cut from the
// PDF, from the PDF's own text with display math cut from the page. Contents, the page you are on, search, Read
// aloud and full screen sit in the bar above.
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

import katex from 'katex'
import {
  ALargeSmall, ChevronDown, ChevronUp, List, Maximize, Minus, Plus, ScrollText, Search, X,
} from 'lucide-react'
import type { PDFDocumentProxy } from 'pdfjs-dist'
import {
  createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode,
} from 'react'

import { call } from '../../rpc'
import { engine, open } from '../pdf/engine'
import { FocusOverlay, useFocus, useFocusKeys, useNoJump } from '../pdf/focus'
import type { Narrator } from '../pdf/reader'
import { Tool } from '../pdf/tool'
import { Spinner } from '../ui'
import { loadLatex, mathFor } from './latex'
import { BACKGROUNDS, FONTS, SIZES, SPACINGS, useLook, WIDTHS, type Look } from './look'
import { plain, type Block, type Box, type Doc, type Inline } from './model'
import { cut, fromPdf, pageWords, place, readText } from './pdftext'

export type ReaderProps = {
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

type State = { doc: Doc; pdf: PDFDocumentProxy | null; pages: number; body: number; note: string }
const places = new Map<string, number>()  // memory name: the block at the top

export default function Reader({ data, latex, memory, narrator, aloud, bar, onPages, focus, onFocus }: ReaderProps) {
  const [look, setLook] = useLook()
  const [state, setState] = useState<State | null>(null)
  const [failed, setFailed] = useState('')
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
  const fromSource = !!latex && look.math === 'source'

  // -- the text ------------------------------------------------------------------------------------------------
  useEffect(() => {
    let dead = false
    setFailed('')
    ;(async () => {
      const { lib } = await engine()
      const pdf = data ? await open(lib, data).promise : null
      const text = pdf ? await readText(pdf, () => dead) : null
      if (dead) return
      let doc: Doc | null = null, note = ''
      if (latex && fromSource) {
        try {
          const read = (path: string) => call<{ text: string }>('latex.read', { cluster: latex.cluster, path })
            .then((r) => r.text)
          doc = await loadLatex(read, latex.main)
          if (!doc.blocks.some((b) => b.t === 'p')) throw new Error('No text')
          if (text) place(doc.blocks, pageWords(text))
        } catch {
          doc = null
          if (text) note = 'The LaTeX source could not be read, so this is the text of the PDF.'
        }
      }
      if (!doc && text) doc = fromPdf(text)
      if (dead) return
      if (!doc || !doc.blocks.length) { setFailed(data ? 'This PDF has no text to show.' : 'No PDF yet.'); return }
      setState({ doc, pdf, pages: text?.count ?? 0, body: text?.body ?? 10, note })
    })().catch((e: Error) => { if (!dead) setFailed(`Could not read the text: ${e.message}`) })
    return () => { dead = true }
  }, [data, latex?.cluster, latex?.main, fromSource])  // eslint-disable-line react-hooks/exhaustive-deps

  const blocks = state?.doc.blocks
  const heads = useMemo(() => (blocks ?? []).map((b, i) => ({ b, i })).filter(({ b }) => b.t === 'h') as
    { b: Extract<Block, { t: 'h' }>; i: number }[], [blocks])
  const head = [...heads].reverse().find((h) => h.i <= at)
  const page = blocks?.[at]?.page ?? 1

  // -- where you are -------------------------------------------------------------------------------------------
  useEffect(() => {  // back to where you were
    const i = memory ? places.get(memory) : undefined
    if (!state || !i) return
    requestAnimationFrame(() => column.current?.querySelector(`[data-i="${i}"]`)?.scrollIntoView({ block: 'start' }))
  }, [state, memory])
  useEffect(() => {
    const el = scroller.current
    if (!el || !state) return
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
  }, [state, memory])
  const pageRef = useRef(page)
  pageRef.current = page
  useEffect(() => { narrator?.watchPage(() => pageRef.current) }, [narrator])

  const goTo = (i: number) => {
    setPanel('')
    column.current?.querySelector(`[data-i="${i}"]`)?.scrollIntoView({ block: 'start', behavior: 'smooth' })
  }

  // -- search ----------------------------------------------------------------------------------------------------
  useEffect(() => {
    const marks = [...(column.current?.querySelectorAll<HTMLElement>('mark.reader-hit') ?? [])]
    setHit((h) => ({ n: marks.length ? Math.min(h.n, marks.length - 1) : 0, total: marks.length }))
  }, [query, state, look])
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
  const wide = panel === 'look'
  const ctx = useMemo(() => state && { doc: state.doc, pdf: state.pdf, body: state.body, query: query.trim() },
    [state, query])
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
        {state && state.pages > 0 && <span className="mr-1.5 shrink-0 whitespace-nowrap tabular-nums text-dim">
          Page {page} of {state.pages}</span>}
        <Tool label="Search (Ctrl+F)" on={searching} disabled={!state}
          onClick={() => searching ? closeSearch() : openSearch()}><Search size={16} /></Tool>
        <Tool label="Reading settings" on={panel === 'look'} onClick={() => setPanel(panel === 'look' ? '' : 'look')}>
          <ALargeSmall size={18} /></Tool>
        {aloud}
        {onPages && <Tool label="Show the pages" onClick={onPages}><ScrollText size={16} /></Tool>}
        <Tool label="Full screen (F)" disabled={!state} onClick={() => setFocused(true)}><Maximize size={16} /></Tool>
      </div>
      {!focused && bar}
      <div className="relative min-h-0 flex-1">
        <div ref={scroller} tabIndex={-1} data-bg={look.bg || undefined}
          className="reader-surface absolute inset-0 overflow-y-auto outline-none">
          {failed ? <p className="p-10 text-center text-sm text-dim">{failed}</p>
            : !state || !ctx ? <div className="flex h-full flex-col items-center justify-center gap-3 text-sm text-dim">
                <Spinner size={24} />Reading the paper…</div>
            : <div className="reader-pad" style={{ paddingRight: wide ? 380 : undefined }}>
                <Ctx.Provider value={ctx}>
                  <div ref={column} className="reader-col" style={{ fontFamily: font.family, fontSize: look.size,
                    lineHeight: SPACINGS[look.spacing], maxWidth: `${WIDTHS[look.width]}em` }}>
                    {state.note && <p className="reader-note" data-i={0}>{state.note}</p>}
                    {state.doc.blocks.map((b, i) => (
                      <div key={i} data-i={i} className="reader-block">
                        {b.page && b.page !== state.doc.blocks[i - 1]?.page && state.pages > 0 &&
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
        {searching && (
          <div className="absolute top-2 right-3 z-30 flex items-center gap-1 rounded-xl border border-line bg-window
            p-1 shadow-lg">
            <input ref={queryBox} value={query} placeholder="Find in text" aria-label="Find in text"
              onChange={(e) => { setQuery(e.target.value); setHit({ n: 0, total: 0 }) }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') { e.preventDefault(); step(e.shiftKey) }
                if (e.key === 'Escape') { e.stopPropagation(); closeSearch() }
              }}
              className={`h-7 w-44 rounded-md bg-pill px-2 text-sm outline-none focus-visible:ring-2
                focus-visible:ring-inset focus-visible:ring-focus ${query.trim() && !hit.total ? 'ring-2 ring-bad' : ''}`} />
            <span className="min-w-[52px] text-center text-xs tabular-nums text-dim">
              {query.trim() ? hit.total ? `${hit.n + 1} of ${hit.total}` : 'None' : ''}</span>
            <Tool label="Previous (Shift+Enter)" onClick={() => step(true)}><ChevronUp size={16} /></Tool>
            <Tool label="Next (Enter)" onClick={() => step()}><ChevronDown size={16} /></Tool>
            <Tool label="Close" onClick={closeSearch}><X size={16} /></Tool>
          </div>
        )}
        {focused && <FocusOverlay what="Full screen" page={page} pages={state?.pages ?? 0}
          onExit={() => setFocused(false)} />}
      </div>
    </div>
  )
}

// -- settings ----------------------------------------------------------------------------------------------------------
function useOutside(onClose: () => void) {
  const box = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const down = (e: MouseEvent) => {
      const t = e.target as HTMLElement
      if (!box.current?.contains(t) && !t.closest?.('[aria-label="Reading settings"], [aria-expanded]')) onClose()
    }
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); onClose() } }
    window.addEventListener('mousedown', down)
    window.addEventListener('keydown', key, true)
    return () => { window.removeEventListener('mousedown', down); window.removeEventListener('keydown', key, true) }
  }, [onClose])
  return box
}

function Choice<T extends string>({ label, value, options, onPick }:
  { label: string; value: T; options: [T, string][]; onPick: (v: T) => void }) {
  return (
    <div className="flex min-h-11 items-center justify-between gap-3 border-b border-line">
      <span>{label}</span>
      <div role="radiogroup" aria-label={label} className="flex gap-0.5 rounded-[7px] bg-control p-0.5">
        {options.map(([v, l]) => (
          <button key={v} role="radio" aria-checked={value === v} onClick={() => onPick(v)}
            className={`h-[26px] min-w-[30px] rounded-[5px] px-2.5 text-sm ${value === v
              ? 'bg-window font-semibold text-text shadow-[0_0_0_1px_var(--color-line-strong)]' : 'text-dim hover:text-text'}`}>
            {l}</button>
        ))}
      </div>
    </div>
  )
}

function LookPanel({ look, set, hasSource, onClose }:
  { look: Look; set: (c: Partial<Look> | null) => void; hasSource: boolean; onClose: () => void }) {
  const box = useOutside(onClose)
  const dark = document.documentElement.dataset.theme === 'dark'
  const bg = look.bg || (dark ? 'black' : 'white')
  return (
    <div ref={box} role="dialog" aria-label="Reading settings" className="absolute top-2 right-3 z-30 max-h-[calc(100%-16px)]
      w-[348px] max-w-[calc(100%-24px)] overflow-y-auto rounded-xl bg-raised px-4 pt-1.5 pb-2.5 text-sm
      shadow-[var(--shadow-menu)]">
      <div className="flex min-h-10 items-center justify-between border-b border-line">
        <span className="text-xs font-semibold tracking-wide text-dim uppercase">Reading</span>
        <button onClick={() => set(null)} className="rounded-md px-1.5 py-0.5 text-dim hover:bg-hover hover:text-text">
          Reset</button>
      </div>
      <div className="border-b border-line py-3">
        <div className="mb-2">Font</div>
        <div role="radiogroup" aria-label="Font" className="grid grid-cols-3 gap-1.5">
          {FONTS.map((f) => (
            <button key={f.id} role="radio" aria-checked={look.font === f.id} onClick={() => set({ font: f.id })}
              className={`flex h-14 flex-col justify-center rounded-lg border px-2.5 text-left ${look.font === f.id
                ? 'border-transparent shadow-[0_0_0_2px_var(--color-text)]' : 'border-line hover:bg-hover'}`}>
              <span className="text-xl leading-6" style={{ fontFamily: f.family }}>Ag</span>
              <span className="truncate text-xs text-dim">{f.label}</span>
            </button>
          ))}
        </div>
      </div>
      <div className="flex min-h-11 items-center justify-between border-b border-line">
        <span>Size</span>
        <div className="flex h-[30px] items-center rounded-[7px] bg-control">
          <button aria-label="Smaller" disabled={look.size <= SIZES.min} onClick={() => set({ size: look.size - 1 })}
            className="grid h-[30px] w-[34px] place-items-center rounded-[7px] hover:bg-hover disabled:opacity-40">
            <Minus size={14} /></button>
          <b className="min-w-[34px] text-center text-sm font-semibold tabular-nums">{look.size}</b>
          <button aria-label="Bigger" disabled={look.size >= SIZES.max} onClick={() => set({ size: look.size + 1 })}
            className="grid h-[30px] w-[34px] place-items-center rounded-[7px] hover:bg-hover disabled:opacity-40">
            <Plus size={14} /></button>
        </div>
      </div>
      <Choice label="Line spacing" value={look.spacing} onPick={(v) => set({ spacing: v })}
        options={[['tight', 'Tight'], ['normal', 'Normal'], ['loose', 'Loose']]} />
      <Choice label="Page width" value={look.width} onPick={(v) => set({ width: v })}
        options={[['narrow', 'Narrow'], ['medium', 'Medium'], ['wide', 'Wide']]} />
      <div className={`flex min-h-[62px] items-center justify-between ${hasSource ? 'border-b border-line' : ''}`}>
        <span>Background</span>
        <div role="radiogroup" aria-label="Background" className="flex gap-3">
          {BACKGROUNDS.map((b) => (
            <button key={b.id} role="radio" aria-checked={bg === b.id} aria-label={b.label} title={b.label}
              onClick={() => set({ bg: b.id })} style={{ background: b.color }}
              className={`relative size-[26px] rounded-full shadow-[inset_0_0_0_1px_rgb(0_0_0/0.14)] ${bg === b.id
                ? 'after:absolute after:-inset-1 after:rounded-full after:shadow-[0_0_0_2px_var(--color-text)]' : ''}`} />
          ))}
        </div>
      </div>
      {hasSource && (
        <div className="flex min-h-11 items-center justify-between">
          <span>Math</span>
          <div className="relative">
            <select aria-label="Math" value={look.math} onChange={(e) => set({ math: e.target.value as Look['math'] })}
              className="h-[30px] appearance-none rounded-md bg-control pr-7 pl-2.5 text-sm outline-none">
              <option value="source">From the LaTeX source</option>
              <option value="pdf">Cut from the PDF</option>
            </select>
            <ChevronDown size={14} className="pointer-events-none absolute top-2 right-2" />
          </div>
        </div>
      )}
    </div>
  )
}

function Contents({ heads, at, onGo, onClose }: { heads: { b: Extract<Block, { t: 'h' }>; i: number }[]; at: number
  onGo: (i: number) => void; onClose: () => void }) {
  const box = useOutside(onClose)
  const top = Math.min(...heads.map((h) => h.b.level))
  return (
    <nav ref={box} aria-label="Contents" className="absolute top-2 left-2 z-30 max-h-[min(70%,560px)] w-[340px]
      max-w-[calc(100%-16px)] overflow-y-auto rounded-xl bg-raised p-1.5 text-sm shadow-[var(--shadow-menu)]">
      {heads.map(({ b, i }) => (
        <button key={i} onClick={() => onGo(i)} aria-current={i === at || undefined}
          style={{ paddingLeft: 10 + (b.level - top) * 16 }}
          className={`flex w-full items-baseline gap-2 rounded-md py-1.5 pr-2.5 text-left ${i === at ? 'bg-selected font-semibold'
            : 'hover:bg-hover'} ${b.level === top ? '' : 'text-dim'}`}>
          {b.num && <span className="shrink-0 tabular-nums">{b.num}</span>}
          <span className="min-w-0">{plain(b.c)}</span>
        </button>
      ))}
    </nav>
  )
}

// -- the text ----------------------------------------------------------------------------------------------------------
type Context = { doc: Doc; pdf: PDFDocumentProxy | null; body: number; query: string }
const Ctx = createContext<Context | null>(null)
const useCtx = () => useContext(Ctx)!

const rendered = new Map<string, string>()
function Tex({ tex, display = false }: { tex: string; display?: boolean }) {
  const { doc } = useCtx()
  const src = mathFor(tex, doc.labels)
  const key = `${display ? 'D' : 'I'}${src}`
  let html = rendered.get(key)
  if (html === undefined) {
    html = katex.renderToString(src, { displayMode: display, throwOnError: false, strict: 'ignore', trust: false,
      macros: { ...doc.macros }, output: 'html' })
    rendered.set(key, html)
    if (rendered.size > 3000) rendered.delete(rendered.keys().next().value!)
  }
  return display ? <div className="reader-tex" dangerouslySetInnerHTML={{ __html: html }} />
    : <span dangerouslySetInnerHTML={{ __html: html }} />
}

function Marked({ s }: { s: string }) {
  const { query } = useCtx()
  if (!query) return <>{s}</>
  const low = s.toLowerCase(), q = query.toLowerCase(), out: ReactNode[] = []
  let i = 0
  for (let j = low.indexOf(q); j >= 0; j = low.indexOf(q, j + q.length)) {
    out.push(s.slice(i, j), <mark key={j} className="reader-hit">{s.slice(j, j + q.length)}</mark>)
    i = j + q.length
  }
  out.push(s.slice(i))
  return <>{out}</>
}

function Inl({ c }: { c: Inline[] }) {
  const { doc } = useCtx()
  return <>{c.map((x, k) => {
    switch (x.t) {
      case 'text': return <Marked key={k} s={x.s} />
      case 'em': return <em key={k}><Inl c={x.c} /></em>
      case 'b': return <strong key={k}><Inl c={x.c} /></strong>
      case 'code': return <code key={k}><Inl c={x.c} /></code>
      case 'sc': return <span key={k} className="reader-sc"><Inl c={x.c} /></span>
      case 'math': return <Tex key={k} tex={x.tex} />
      case 'br': return <br key={k} />
      case 'note': return <sup key={k} className="reader-mark">{x.n}</sup>
      case 'cite': return <Marked key={k} s={`[${x.keys.map((key) => doc.cites[key] ?? '?').join(', ')}]`} />
      case 'ref': {
        const l = doc.labels[x.key]
        const num = l?.num ?? '??'
        const s = x.style === 'eq' ? `(${num})` : x.style === 'named' && l
          ? `${l.kind} ${l.kind === 'Equation' ? `(${num})` : num}` : num
        return <Marked key={k} s={s} />
      }
    }
  })}</>
}

function Blocks({ c }: { c: Block[] }) {
  return <>{c.map((b, k) => <BlockView key={k} b={b} />)}</>
}

/** A box's label run in at the start of its first paragraph, like LaTeX does. */
function RunIn({ label, c, end }: { label: ReactNode; c: Block[]; end?: ReactNode }) {
  const [first, ...rest] = c
  const last = rest.length ? rest[rest.length - 1] : first
  if (!first) return <p>{label}{end}</p>
  return <>
    {first.t === 'p' ? <p>{label} <Inl c={first.c} />{first === last && end}</p> : <><p>{label}</p><BlockView b={first} /></>}
    {rest.map((b, k) => b === last && b.t === 'p' ? <p key={k}><Inl c={b.c} />{end}</p> : <BlockView key={k} b={b} />)}
    {last && last.t !== 'p' && end && <p className="reader-qed">{end}</p>}
  </>
}

function BlockView({ b }: { b: Block }) {
  const { pdf, body } = useCtx()
  switch (b.t) {
    case 'title': return <header className="reader-title"><h1><Inl c={b.c} /></h1>
      {b.by.length > 0 && <p><Inl c={b.by} /></p>}</header>
    case 'h': {
      const H = b.level <= 1 ? 'h2' : b.level === 2 ? 'h3' : 'h4'
      return <H className={`reader-h${Math.min(b.level, 4)}`}>{b.num && <span className="reader-num">{b.num}</span>}
        <Inl c={b.c} /></H>
    }
    case 'p': return <p className={b.small ? 'reader-small' : undefined}><Inl c={b.c} /></p>
    case 'math': return (
      <div className="reader-eq">
        <div className="reader-eqb"><Tex tex={b.tex} display /></div>
        {b.tags.length > 0 && <div className="reader-tags">{b.tags.map((t, k) => <span key={k}>{t && `(${t})`}</span>)}</div>}
      </div>
    )
    case 'cut': return pdf ? <Cut pdf={pdf} page={b.page ?? 1} box={b.box} tag={b.tag} body={body} /> : null
    case 'list': {
      const L = b.ordered ? 'ol' : 'ul'
      return <L className="reader-list">{b.items.map((it, k) => (
        <li key={k}>{it.label && <strong className="reader-item"><Inl c={it.label} /></strong>}<Blocks c={it.c} /></li>
      ))}</L>
    }
    case 'box':
      if (b.kind === 'abstract') return <section className="reader-abstract"><h3><Inl c={b.label} /></h3><Blocks c={b.c} /></section>
      if (b.kind === 'quote') return <blockquote className="reader-quote"><Blocks c={b.c} /></blockquote>
      if (b.kind === 'proof') return <div className="reader-proof"><RunIn label={<em><Inl c={b.label} />.</em>} c={b.c}
        end={<span className="reader-qed-mark"> ∎</span>} /></div>
      return <div className="reader-thm"><RunIn label={<strong><Inl c={b.label} />.</strong>} c={b.c} /></div>
    case 'caption': return <p className="reader-caption"><strong>{b.label}.</strong> <Inl c={b.c} /></p>
    case 'code': return <pre className="reader-code">{b.s}</pre>
    case 'notes': return <div className="reader-notes">{b.items.map((n) => (
      <p key={n.n}><sup className="reader-mark">{n.n}</sup> <Inl c={n.c} /></p>))}</div>
    case 'refs': return <ol className="reader-refs">{b.items.map((r) => (
      <li key={r.key}><span className="reader-ref-label">[{r.label}]</span><span><Inl c={r.c} /></span></li>))}</ol>
  }
}

/** Display math cut from the PDF, drawn in the text's color and sized with the text. */
function Cut({ pdf, page, box, tag, body }: { pdf: PDFDocumentProxy; page: number; box: Box; tag?: string; body: number }) {
  const [url, setUrl] = useState('')
  const el = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const node = el.current
    if (!node) return
    let dead = false
    const seen = new IntersectionObserver((es) => {
      if (!es.some((e) => e.isIntersecting)) return
      seen.disconnect()
      cut(pdf, page, box, 4 * Math.max(1, devicePixelRatio)).then((u) => { if (!dead) setUrl(u) }).catch(() => {})
    }, { rootMargin: '600px 0px' })
    seen.observe(node)
    return () => { dead = true; seen.disconnect() }
  }, [pdf, page, box])
  const w = (box[2] - box[0] + 4) / body, h = (box[3] - box[1] + 4) / body
  return (
    <div ref={el} className="reader-eq">
      <div className="reader-eqb">
        <span role="img" aria-label="An equation from the PDF" className="reader-cut"
          style={{ width: `${w}em`, aspectRatio: `${w} / ${h}`, ...(url ? { WebkitMaskImage: `url(${url})`,
            maskImage: `url(${url})` } : { background: 'transparent' }) }} />
      </div>
      {tag && <div className="reader-tags"><span>{tag}</span></div>}
    </div>
  )
}
