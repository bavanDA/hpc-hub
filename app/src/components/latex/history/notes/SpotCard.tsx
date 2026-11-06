import { MapPin, MessageCircleQuestion, X } from 'lucide-react'
import { useState } from 'react'

import type { About, NotePlace } from '../../../../types/history'
import { Button } from '../../../ui'
import { AskBox } from '../ask/AskBox'
import { Thread } from '../ask/Thread'
import type { Go } from '../go'
import type { Assist } from '../useAssist'

export type CardSpot = { id: string; mode: 'ask' | 'note'; title: string; about: About; place: NotePlace | null
  here?: string }

/** Floats over the editor or the PDF: ask about a passage or a spot (its answers show here), or add a note there. */
export function SpotCard({ spot, assist, go, onClose }: { spot: CardSpot; assist: Assist; go: Go; onClose: () => void }) {
  const [text, setText] = useState('')
  const [asking, setAsking] = useState(true)
  const jobs = assist.jobs.filter((j) => j.ask?.scope === 'card' && j.ask.anchor === spot.id)
  const save = async () => { if (text.trim() && await assist.addNote(text.trim(), spot.place)) onClose() }
  return (
    <div className="menu-in fixed top-36 right-6 z-40 flex max-h-[calc(100vh-180px)] w-[560px] flex-col rounded-xl border
      border-line bg-raised shadow-[var(--shadow-dialog)]">
      <div className="flex shrink-0 items-center gap-2 px-4 pt-3.5">
        {spot.mode === 'note' ? <MapPin size={14} className="text-dim" /> : <MessageCircleQuestion size={14} className="text-dim" />}
        <b className="min-w-0 flex-1 truncate">{spot.mode === 'note' ? 'Note on' : 'Ask about'} {spot.title}</b>
        <button onClick={onClose} aria-label="Close" className="grid size-7 place-items-center rounded-md text-dim hover:bg-hover">
          <X size={14} /></button></div>
      {spot.mode === 'note' ? <div className="px-4 pb-4">
        <textarea autoFocus value={text} onChange={(e) => setText(e.target.value)} rows={3} aria-label="Note"
          placeholder="A to-do or a comment" onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) void save()
            if (e.key === 'Escape') onClose()
          }}
          className="mt-2.5 block w-full resize-none rounded-lg bg-pill px-3 py-2 outline-none placeholder:text-faint
            focus:ring-2 focus:ring-focus" />
        <div className="mt-2.5 flex items-center justify-end gap-2">
          <span className="flex-1 text-xs text-dim">Kept next to the paper in .git, never committed or pushed.</span>
          <Button size="sm" kind="ghost" onClick={onClose}>Cancel</Button>
          <Button size="sm" kind="primary" disabled={!text.trim()} onClick={() => void save()}>Add note</Button>
        </div>
      </div> : <div className="min-h-0 overflow-y-auto px-1 pb-2">
        {jobs.map((j) => <Thread key={j.id} job={j} go={go} here={spot.here} className="mx-3 my-2"
          onNote={(t) => void assist.addNote(t, spot.place)} onMore={() => setAsking(true)}
          onCancel={() => assist.cancel(j.id)} onClose={() => assist.forget(j.id)} />)}
        {asking && <AskBox className="mx-3 my-2" title={spot.title} choice={assist.choice} onClose={jobs.length
          ? () => setAsking(false) : onClose} onAsk={(question, pick) => {
          assist.ask({ question, about: spot.about, scope: 'card', anchor: spot.id, title: spot.title }, pick ?? undefined)
          setAsking(false)
        }} />}
      </div>}
    </div>
  )
}
