// The shared PDF viewer with Read aloud, in phone form: the headphones in the toolbar open a player at the bottom
// (voice, speed, stop, previous sentence, play, next sentence), the spoken word is marked and followed, a tap on a
// word reads from there, and holding a word opens the dictionary as a sheet. The voice is the phone's own
// (readaloud/reader.ts), so it reads any PDF, also without the internet when the voice is on the phone, and needs no
// compute node. With reflow it shows the desktop's Reader over the pages, with a one-line player at the bottom.
import { Check, Headphones, Loader2, Pause, Play, SkipBack, SkipForward, Square, Volume2, X } from 'lucide-react'
import { lazy, Suspense, useEffect, useRef, useState } from 'react'

import { Pdf, type PdfProps, type WordPick } from '@shared/components/pdf'
import { Meanings } from '@shared/components/pdf/Meanings'
import { speedLabel, SPEEDS } from '@shared/components/pdf/narrator'
import { useEntry } from '@shared/components/pdf/useEntry'
import { Tool } from '@shared/components/pdf/tool'
import { Spinner } from '@shared/components/ui/Spinner'
import { useBackLayer } from '../nav'
import { BottomSheet, Button, IconBtn, PickerSheet, Row, Section } from '../ui'
import { usePhoneReader, usePhoneVoices, useReaderState, type PhoneReader, type PhoneVoice } from './readaloud/reader'

const Reflow = lazy(() => import('@shared/components/reader/Reader'))

/** The phone's narrower default for the Reader's text, the first time (reader.look is the desktop's own key). */
function firstLook() {
  try {
    if (localStorage.getItem('reader.look') === null) localStorage.setItem('reader.look', JSON.stringify({ size: 17 }))
  } catch { /* private window */ }
}
firstLook()

export function ReadAloudPdf({ extra, cluster: _cluster, reflow, latex, ...props }: PdfProps & { cluster?: string
  reflow?: boolean; latex?: { cluster: string; main: string } }) {
  const reader = usePhoneReader()
  const [open, setOpen] = useState(false)
  const [word, setWord] = useState<WordPick | null>(null)
  const panelOpen = useReaderPanelOpen(!!reflow)
  useBackLayer(panelOpen.close, panelOpen.open)
  const close = () => { reader.close(); setOpen(false) }
  const toggle = <Tool label="Read aloud" on={open} disabled={!props.data}
    onClick={() => open ? close() : setOpen(true)}><Headphones size={20} /></Tool>
  return (
    <div ref={panelOpen.box} className="relative flex h-full flex-col">
      <div className="min-h-0 flex-1">
        <Pdf {...props} reader={reader} extra={<>{toggle}{extra}</>} onWord={setWord}
          footer={open && !reflow && <Player reader={reader} onClose={close} />} />
      </div>
      {reflow && (
        <div className="phone-reader absolute inset-0 z-10 flex flex-col bg-window">
          <div className="min-h-0 flex-1">
            <Suspense fallback={<div className="grid h-full place-items-center bg-window"><Spinner size={24} /></div>}>
              <Reflow data={props.data} latex={latex} memory={props.memory} narrator={reader} aloud={toggle} />
            </Suspense>
          </div>
          {open && <ReaderPlayer reader={reader} onClose={close} />}
        </div>
      )}
      {word && <WordSheet key={`${word.text}:${word.x}:${word.y}`} pick={word} reader={reader}
        onClose={() => setWord(null)}
        onRead={() => { setWord(null); setOpen(true); reader.readFrom(word.spot) }} />}
    </div>
  )
}

/** Whether the Reader's own Contents, Reading settings or search is open: they are the desktop's and don't know about
 *  Back, so close sends them the Escape they listen for. */
function useReaderPanelOpen(on: boolean) {
  const box = useRef<HTMLDivElement>(null)
  const [open, setOpen] = useState(false)
  const FIND = 'input[aria-label="Find in text"]'
  useEffect(() => {
    const el = box.current
    if (!el || !on) { setOpen(false); return }
    const look = () => setOpen(!!el.querySelector(`nav[aria-label="Contents"], [role="dialog"][aria-label="Reading settings"], ${FIND}`))
    look()
    const seen = new MutationObserver(look)
    seen.observe(el, { childList: true, subtree: true })
    return () => seen.disconnect()
  }, [on])
  const close = () => {
    const esc = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })
    const find = box.current?.querySelector(FIND)
    if (find) find.dispatchEvent(esc)
    else window.dispatchEvent(esc)
  }
  return { box, open, close }
}

/** The design's player under the Reader: play, what it is reading, the speed, close. */
function ReaderPlayer({ reader, onClose }: { reader: PhoneReader; onClose: () => void }) {
  const s = useReaderState(reader)
  const [picking, setPicking] = useState(false)
  useEffect(() => { reader.begin() }, [reader])
  const busy = s.phase === 'preparing'
  const label = s.playing ? 'Pause' : s.phase === 'error' ? 'Try again' : 'Play'
  return (
    <div className="flex h-12 shrink-0 items-center gap-1 border-t border-line bg-window px-2">
      <button aria-label={label} disabled={busy} onClick={() => reader.toggle()}
        className="grid size-10 shrink-0 place-items-center rounded-md active:bg-pressed disabled:opacity-60">
        {busy ? <Loader2 size={20} className="animate-spin" /> : s.playing ? <Pause size={20} fill="currentColor" /> : <Play size={20} />}</button>
      <p className={`min-w-0 flex-1 truncate text-sm ${s.phase === 'error' ? 'text-bad' : ''}`}>
        {s.text || `Reading from page ${s.page || 1}`}</p>
      <button aria-label="Speed" onClick={() => setPicking(true)}
        className="h-9 shrink-0 rounded-md px-2 text-sm text-dim tabular-nums active:bg-pressed">{speedLabel(s.rate)}</button>
      <IconBtn icon={X} label="Close read aloud" small onClick={onClose} />
      {picking && <PickerSheet title="Speed" value={String(s.rate)} onClose={() => setPicking(false)}
        options={SPEEDS.map((r) => ({ value: String(r), label: speedLabel(r) }))}
        onPick={(v) => reader.setRate(Number(v))} />}
    </div>
  )
}

const ROUND = 'grid size-12 shrink-0 place-items-center rounded-full active:bg-pressed disabled:opacity-40'
const CHIP = 'flex h-11 min-w-0 items-center rounded-full border border-line-strong px-3.5 text-sm font-medium ' +
  'active:bg-pressed'

function Player({ reader, onClose }: { reader: PhoneReader; onClose: () => void }) {
  const s = useReaderState(reader)
  const list = usePhoneVoices()
  const [picking, setPicking] = useState<'' | 'voice' | 'speed'>('')
  useEffect(() => { reader.begin() }, [reader])
  const ready = s.phase === 'ready', busy = s.phase === 'preparing'
  const voice = list.find((v) => v.id === s.voice)
  const label = s.playing ? 'Pause' : s.phase === 'error' ? 'Try again' : 'Play'
  return (
    <div className="shrink-0 border-t border-line bg-window px-2 pt-1.5 pb-2">
      <div className="flex min-h-11 items-center gap-2 px-2">
        <p className={`min-w-0 flex-1 text-sm leading-tight ${s.phase === 'error' ? 'text-bad' : 'text-dim'}`}>
          {s.text || (s.pages > 0 && <span className="tabular-nums">Page {s.page} of {s.pages}</span>)}</p>
        <button className={`${CHIP} max-w-[45%]`} onClick={() => setPicking('voice')} aria-label="Voice">
          <span className="truncate">{voice?.short ?? 'Voice'}</span></button>
        <button className={`${CHIP} tabular-nums`} onClick={() => setPicking('speed')} aria-label="Speed">
          {speedLabel(s.rate)}</button>
      </div>
      <div className="flex items-center justify-between px-1 pt-1">
        <button aria-label="Stop" className={ROUND} disabled={!ready} onClick={() => reader.stop()}>
          <Square size={16} fill="currentColor" /></button>
        <button aria-label="Previous sentence" className={ROUND} disabled={!ready} onClick={() => reader.skip(-1)}>
          <SkipBack size={20} /></button>
        <button aria-label={label} disabled={busy} onClick={() => reader.toggle()}
          className="grid size-14 shrink-0 place-items-center rounded-full bg-accent text-on-accent
            active:bg-accent-pressed disabled:opacity-60">
          {busy ? <Loader2 size={24} className="animate-spin" /> : s.playing ? <Pause size={24} fill="currentColor" />
            : <Play size={24} fill="currentColor" className="ml-0.5" />}</button>
        <button aria-label="Next sentence" className={ROUND} disabled={!ready} onClick={() => reader.skip(1)}>
          <SkipForward size={20} /></button>
        <button aria-label="Close read aloud" className={ROUND} onClick={onClose}><X size={22} /></button>
      </div>
      {picking === 'voice' && <VoiceSheet voices={list} value={s.voice} onClose={() => setPicking('')}
        onPick={(v) => reader.setVoice(v)} />}
      {picking === 'speed' && <PickerSheet title="Speed" value={String(s.rate)} onClose={() => setPicking('')}
        options={SPEEDS.map((r) => ({ value: String(r), label: speedLabel(r) }))}
        onPick={(v) => reader.setRate(Number(v))} />}
    </div>
  )
}

/** The phone's voices: the ones on the phone first, then the ones that need the internet. English and the phone's
 *  own language show; the rest wait behind More languages. */
function VoiceSheet({ voices, value, onPick, onClose }:
  { voices: PhoneVoice[]; value: string; onPick: (id: string) => void; onClose: () => void }) {
  const own = (navigator.language || 'en').split('-')[0].toLowerCase()
  const near = (v: PhoneVoice) => v.english || v.lang.split('-')[0].toLowerCase() === own || v.id === value
  const [all, setAll] = useState(() => !voices.some(near))
  const shown = all ? voices : voices.filter(near)
  const row = (v: PhoneVoice) => (
    <Row key={v.id} label={v.label} onPress={() => { onClose(); onPick(v.id) }}>
      {v.id === value ? <Check size={20} aria-label="Chosen" className="shrink-0" /> : <span className="w-5" />}</Row>
  )
  const here = shown.filter((v) => v.offline), online = shown.filter((v) => !v.offline)
  return (
    <BottomSheet title="Voice" onClose={onClose}>
      <div className="-mx-4 -mt-5">
        {!voices.length && <p className="px-4 pt-5 text-sm text-dim">Getting the phone's voices…</p>}
        {here.length > 0 && <Section title="On this phone">{here.map(row)}</Section>}
        {online.length > 0 && <Section title="Needs the internet">{online.map(row)}</Section>}
        {!all && shown.length < voices.length && <div className="pt-5"><Row label="More languages" opens
          onPress={() => setAll(true)} /></div>}
      </div>
    </BottomSheet>
  )
}

function WordSheet({ pick, reader, onRead, onClose }:
  { pick: WordPick; reader: PhoneReader; onRead: () => void; onClose: () => void }) {
  const entry = useEntry(pick.text)
  const [saying, setSaying] = useState('')
  const say = () => {
    setSaying('…')
    reader.hear(entry?.word || pick.text).then(() => setSaying(''))
      .catch((e: Error) => setSaying(e.message))
  }
  const sound = [entry?.respelling, entry?.phonetic].filter(Boolean)
  return (
    <BottomSheet title="Dictionary" onClose={onClose}>
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <h2 className="text-2xl leading-tight font-semibold break-words">{entry?.word || pick.text}</h2>
          {sound.length > 0 && <p className="pt-1 font-medium break-words">{sound[0]}</p>}
          {sound.length > 1 && <p className="text-sm break-words text-dim">{sound[1]}</p>}
          {saying && saying !== '…' && <p className="pt-1 text-sm text-bad">{saying}</p>}
        </div>
        <button aria-label="Hear it" onClick={say} disabled={saying === '…'}
          className="grid size-12 shrink-0 place-items-center rounded-full border border-line-strong active:bg-pressed
            disabled:opacity-50">
          {saying === '…' ? <Loader2 size={20} className="animate-spin text-dim" /> : <Volume2 size={22} />}</button>
      </div>
      <Button icon={Play} className="mt-4 w-full" onClick={onRead}>Read from here</Button>
      <div className="-mx-4 mt-4"><Meanings entry={entry} pad="px-4" /></div>
    </BottomSheet>
  )
}
