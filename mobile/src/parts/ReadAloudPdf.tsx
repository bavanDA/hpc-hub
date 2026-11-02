// The shared PDF viewer with Read aloud, in phone form: the headphones in the toolbar open a player at the bottom
// (voice, speed, stop, 10 s back, play, 10 s forward), the spoken word is marked and followed, a tap on a word
// reads from there, and holding a word opens the dictionary as a sheet.
import { Headphones, Loader2, Pause, Play, RotateCcw, RotateCw, Square, Volume2, X } from 'lucide-react'
import { useState } from 'react'

import { Pdf, type PdfProps, type WordPick } from '@shared/components/pdf'
import { Meanings, useEntry } from '@shared/components/pdf/Meanings'
import {
  clock, hear, speedLabel, SPEEDS, useReader, useReaderState, useVoices, type Reader, type Source,
} from '@shared/components/pdf/reader'
import { Tool } from '@shared/components/pdf/tool'
import { BottomSheet, Button, PickerSheet } from '../ui'

export function ReadAloudPdf({ source, extra, ...props }: PdfProps & { source?: Source }) {
  const reader = useReader(source)
  const [open, setOpen] = useState(false)
  const [word, setWord] = useState<WordPick | null>(null)
  const close = () => { reader.close(); setOpen(false) }
  const toggle = source && <Tool label="Read aloud" on={open} disabled={!props.data}
    onClick={() => open ? close() : setOpen(true)}><Headphones size={20} /></Tool>
  return (
    <>
      <Pdf {...props} reader={reader} extra={<>{toggle}{extra}</>} onWord={setWord}
        footer={open && <Player reader={reader} onClose={close} />} />
      {word && <WordSheet key={`${word.text}:${word.x}:${word.y}`} pick={word} reader={reader}
        onClose={() => setWord(null)} onRead={() => { setWord(null); setOpen(true); reader.readFrom(word.spot) }} />}
    </>
  )
}

const ROUND = 'grid size-12 shrink-0 place-items-center rounded-full active:bg-pressed disabled:opacity-40'
const CHIP = 'flex h-11 min-w-0 items-center rounded-full border border-line-strong px-3.5 text-sm font-medium ' +
  'active:bg-pressed'

function Player({ reader, onClose }: { reader: Reader; onClose: () => void }) {
  const s = useReaderState(reader)
  const list = useVoices()
  const [picking, setPicking] = useState<'' | 'voice' | 'speed'>('')
  const ready = s.phase === 'ready', busy = s.phase === 'preparing'
  const voice = list.find((v) => v.id === s.voice) ?? list[0]
  const label = s.playing ? 'Pause' : ready ? 'Play' : s.phase === 'error' ? 'Try again' : 'Read aloud'
  return (
    <div className="shrink-0 border-t border-line bg-window px-2 pt-1.5 pb-2">
      <div className="flex min-h-11 items-center gap-2 px-2">
        <p className={`min-w-0 flex-1 text-sm leading-tight ${s.phase === 'error' ? 'text-bad' : 'text-dim'}`}>
          {ready && !s.text ? <span className="tabular-nums">{clock(s.at)} / {clock(s.total)}</span> : s.text}</p>
        <button className={CHIP} onClick={() => setPicking('voice')} aria-label="Voice">
          <span className="truncate">{voice?.label.split(' (')[0] ?? 'Voice'}</span></button>
        <button className={`${CHIP} tabular-nums`} onClick={() => setPicking('speed')} aria-label="Speed">
          {speedLabel(s.rate)}</button>
      </div>
      <div className="flex items-center justify-between px-1 pt-1">
        <button aria-label="Stop" className={ROUND} disabled={!ready} onClick={() => reader.stop()}>
          <Square size={16} fill="currentColor" /></button>
        <button aria-label="Back 10 seconds" className={ROUND} disabled={!ready} onClick={() => reader.skip(-10)}>
          <span className="flex items-center gap-0.5 text-sm font-semibold"><RotateCcw size={18} />10</span></button>
        <button aria-label={label} disabled={busy} onClick={() => reader.toggle()}
          className="grid size-14 shrink-0 place-items-center rounded-full bg-accent text-on-accent
            active:bg-accent-pressed disabled:opacity-60">
          {busy ? <Loader2 size={24} className="animate-spin" /> : s.playing ? <Pause size={24} fill="currentColor" />
            : <Play size={24} fill="currentColor" className="ml-0.5" />}</button>
        <button aria-label="Forward 10 seconds" className={ROUND} disabled={!ready} onClick={() => reader.skip(10)}>
          <span className="flex items-center gap-0.5 text-sm font-semibold">10<RotateCw size={18} /></span></button>
        <button aria-label="Close read aloud" className={ROUND} onClick={onClose}><X size={22} /></button>
      </div>
      {picking === 'voice' && <PickerSheet title="Voice" value={s.voice || list[0]?.id} onClose={() => setPicking('')}
        options={list.map((v) => ({ value: v.id, label: v.label }))} onPick={(v) => reader.setVoice(v)} />}
      {picking === 'speed' && <PickerSheet title="Speed" value={String(s.rate)} onClose={() => setPicking('')}
        options={SPEEDS.map((r) => ({ value: String(r), label: speedLabel(r) }))}
        onPick={(v) => reader.setRate(Number(v))} />}
    </div>
  )
}

function WordSheet({ pick, reader, onRead, onClose }:
  { pick: WordPick; reader: Reader; onRead: () => void; onClose: () => void }) {
  const entry = useEntry(pick.text)
  const [saying, setSaying] = useState('')
  const say = () => {
    setSaying('…')
    hear(entry?.word || pick.text, reader.getSnapshot().voice).then(() => setSaying(''))
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
