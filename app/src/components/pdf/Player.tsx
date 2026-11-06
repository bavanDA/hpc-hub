import { Loader2, Pause, Play, Square, X } from 'lucide-react'

import { clock } from './clock'
import { speedLabel, SPEEDS, type Reader } from './reader'
import { TenSeconds } from './TenSeconds'
import { Tool } from './tool'
import { useReaderState, useVoices } from './useReader'

const SELECT = 'h-8 min-w-0 rounded-md border border-line-strong bg-window px-1.5 text-sm outline-none ' +
  'focus-visible:border-accent'

export function Player({ reader, onClose }: { reader: Reader; onClose: () => void }) {
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
      <TenSeconds back disabled={!ready} onClick={() => reader.skip(-10)} />
      <TenSeconds disabled={!ready} onClick={() => reader.skip(10)} />
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
