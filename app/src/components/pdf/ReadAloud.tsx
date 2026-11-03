// The desktop PDF viewer with Read aloud: a player under the toolbar (voice, speed, play, 10 s back and forward,
// stop, the clock), the spoken word marked on the page, a click on a word reads from there, and a right-click on
// a word looks it up in a Dictionary panel beside the PDF.
import { BookOpen, Headphones, Loader2, Pause, Play, RotateCcw, RotateCw, Square, Volume2, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'

import { ContextMenu } from '../files/ContextMenu'
import { Spinner } from '../ui'
import { Pdf, type PdfProps, type WordPick } from './index'
import { Meanings, useEntry } from './Meanings'
import {
  clock, hear, speedLabel, SPEEDS, useReader, useReaderState, useVoices, type Reader, type Source,
} from './reader'
import { Tool } from './tool'

const NARROW = 760  // below this the dictionary lies over the PDF instead of beside it

/** Reading mode (LaTeX, where a double-click opens the source): a double-click looks the word up instead. */
const READING = 'pdf-reading-mode'
const remembered = () => { try { return localStorage.getItem(READING) === '1' } catch { return false } }

export function ReadablePdf({ source, extra, onSync, ...props }: PdfProps & { source?: Source }) {
  const reader = useReader(source)
  const [open, setOpen] = useState(false)
  const [reading, setReading] = useState(remembered)
  const read = (on: boolean) => {
    setReading(on)
    try { localStorage.setItem(READING, on ? '1' : '0') } catch { /* private window: this visit only */ }
  }
  const [menu, setMenu] = useState<WordPick | null>(null)
  const [word, setWord] = useState<WordPick | null>(null)
  const [narrow, setNarrow] = useState(false)
  const box = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = box.current
    if (!el) return
    const seen = new ResizeObserver(() => setNarrow(el.clientWidth < NARROW))
    seen.observe(el)
    return () => seen.disconnect()
  }, [])
  useEffect(() => { setWord(null); setMenu(null) }, [source?.cluster, source?.path])

  const close = () => { reader.close(); setOpen(false) }
  const readFrom = (w: WordPick) => { setOpen(true); reader.readFrom(w.spot) }
  const toggle = source && <Tool label="Read aloud" on={open} disabled={!props.data}
    onClick={() => open ? close() : setOpen(true)}><Headphones size={16} /></Tool>
  const mode = onSync && <Tool label={reading ? 'Reading mode: double-click looks a word up' : 'Reading mode'}
    on={reading} disabled={!props.data} onClick={() => read(!reading)}><BookOpen size={16} /></Tool>

  return (
    <div ref={box} className="relative flex h-full min-w-0">
      <div className="min-w-0 flex-1">
        <Pdf {...props} reader={reader} extra={<>{mode}{toggle}{extra}</>} onWord={setMenu}
          onSync={reading ? undefined : onSync} onLookUp={setWord}
          bar={open && <Player reader={reader} onClose={close} />} />
      </div>
      {word && <Dictionary key={`${word.text}:${word.x}:${word.y}`} pick={word} reader={reader} overlay={narrow}
        onRead={() => readFrom(word)} onClose={() => setWord(null)} />}
      {menu && <ContextMenu x={menu.x} y={menu.y} onClose={() => setMenu(null)} sections={[
        [{ label: `Look up "${menu.text}"`, onClick: () => setWord(menu) }],
        [{ label: 'Read from here', onClick: () => readFrom(menu) }]]} />}
    </div>
  )
}

/** 10 s back or forward: the arrow and the number side by side, readable at toolbar size. */
function Ten({ back, disabled, onClick }: { back?: boolean; disabled: boolean; onClick: () => void }) {
  const Icon = back ? RotateCcw : RotateCw
  const label = back ? 'Back 10 seconds' : 'Forward 10 seconds'
  return (
    <button aria-label={label} title={label} disabled={disabled} onClick={onClick}
      className="flex h-7 shrink-0 items-center gap-0.5 rounded-md px-1.5 text-xs font-semibold tabular-nums
        hover:bg-hover disabled:opacity-40">
      {back && <Icon size={14} />}10{!back && <Icon size={14} />}
    </button>
  )
}

const SELECT = 'h-8 min-w-0 rounded-md border border-line-strong bg-window px-1.5 text-sm outline-none ' +
  'focus-visible:border-accent'

function Player({ reader, onClose }: { reader: Reader; onClose: () => void }) {
  const s = useReaderState(reader)
  const list = useVoices()
  const ready = s.phase === 'ready'
  const busy = s.phase === 'preparing'
  const label = s.playing ? 'Pause' : ready ? 'Play' : busy ? 'Getting ready' : s.phase === 'error' ? 'Try again'
    : 'Read aloud'
  return (
    <div className="flex min-h-12 shrink-0 flex-wrap items-center gap-x-1 gap-y-1.5 border-b border-line bg-window
      px-2 py-1.5 text-sm">
      <button onClick={() => reader.toggle()} disabled={busy} aria-label={label}
        className="flex h-8 shrink-0 items-center gap-1.5 rounded-md bg-accent pr-3 pl-2.5 font-semibold
          text-on-accent hover:bg-accent-hover active:bg-accent-pressed disabled:opacity-60">
        {busy ? <Loader2 size={15} className="animate-spin" /> : s.playing ? <Pause size={15} fill="currentColor" />
          : <Play size={15} fill="currentColor" />}{label}
      </button>
      <Ten back disabled={!ready} onClick={() => reader.skip(-10)} />
      <Ten disabled={!ready} onClick={() => reader.skip(10)} />
      <Tool label="Stop" disabled={!ready} onClick={() => reader.stop()}><Square size={12} fill="currentColor" /></Tool>
      {ready && <span className="shrink-0 px-1.5 tabular-nums text-dim">{clock(s.at)} / {clock(s.total)}</span>}
      <span className={`min-w-0 flex-1 truncate px-1 ${s.phase === 'error' ? 'text-bad' : 'text-dim'}`}
        title={s.text}>{s.text}</span>
      <select aria-label="Voice" value={s.voice || list[0]?.id || ''} onChange={(e) => reader.setVoice(e.target.value)}
        className={`${SELECT} w-[168px]`}>
        {list.map((v) => <option key={v.id} value={v.id}>{v.label}</option>)}
      </select>
      <select aria-label="Speed" value={s.rate} onChange={(e) => reader.setRate(Number(e.target.value))}
        className={`${SELECT} w-[62px] tabular-nums`}>
        {SPEEDS.map((r) => <option key={r} value={r}>{speedLabel(r)}</option>)}
      </select>
      <Tool label="Close read aloud" onClick={onClose}><X size={16} /></Tool>
    </div>
  )
}

function Dictionary({ pick, reader, overlay, onRead, onClose }:
  { pick: WordPick; reader: Reader; overlay: boolean; onRead: () => void; onClose: () => void }) {
  const entry = useEntry(pick.text)
  const [saying, setSaying] = useState('')
  const say = () => {
    setSaying('…')
    hear(entry?.word || pick.text, reader.getSnapshot().voice).then(() => setSaying(''))
      .catch((e: Error) => setSaying(e.message))
  }
  const sound = [entry?.respelling, entry?.phonetic].filter(Boolean)
  useEffect(() => {
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); onClose() } }
    window.addEventListener('keydown', key, true)  // before the PDF window's own Escape
    return () => window.removeEventListener('keydown', key, true)
  }, [onClose])
  return (
    <aside aria-label="Dictionary" className={`flex w-[320px] shrink-0 flex-col border-l border-line bg-window ${
      overlay ? 'absolute inset-y-0 right-0 z-20 shadow-[var(--shadow-menu)]' : ''}`}>
      <header className="flex h-12 shrink-0 items-center gap-2 border-b border-line pr-1.5 pl-5">
        <span className="flex-1 text-xs font-semibold tracking-wide text-dim uppercase">Dictionary</span>
        <button aria-label="Close dictionary" title="Close" onClick={onClose}
          className="grid size-8 place-items-center rounded-md text-dim hover:bg-hover active:bg-pressed">
          <X size={16} /></button>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="px-5 pt-4 pb-4">
          <h2 className="text-2xl font-semibold break-words">{entry?.word || pick.text}</h2>
          <div className="mt-1.5 flex items-center gap-3">
            <div className="min-w-0 flex-1">
              {sound.length > 0 && <p className="font-medium break-words">{sound[0]}</p>}
              {sound.length > 1 && <p className="text-sm break-words text-dim">{sound[1]}</p>}
              {saying && saying !== '…' && <p className="text-sm text-bad">{saying}</p>}
            </div>
            <button aria-label="Hear it" title="Hear it" onClick={say} disabled={saying === '…'}
              className="grid size-10 shrink-0 place-items-center rounded-full border border-line-strong
                hover:bg-hover active:bg-pressed disabled:opacity-50">
              {saying === '…' ? <Spinner size={16} /> : <Volume2 size={18} />}</button>
          </div>
          <button onClick={onRead} className="mt-4 flex h-9 w-full items-center justify-center gap-2 rounded-lg
            border border-line-strong font-medium hover:bg-hover active:bg-pressed">
            <Play size={14} />Read from here</button>
        </div>
        <Meanings entry={entry} />
      </div>
    </aside>
  )
}
