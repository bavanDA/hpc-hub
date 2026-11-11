// Ask about the line in the editor, or note it: the desktop's floating SpotCard as a window. Its answers show here.
import { useState } from 'react'

import { Thread } from '@shared/components/latex/history/ask/Thread'
import type { Go } from '@shared/components/latex/history/go'
import type { CardSpot } from '@shared/components/latex/history/notes/SpotCard'
import type { Assist } from '@shared/components/latex/history/useAssist'
import { Button, Dialog } from '../../../ui'
import { AskBox } from './AskBox'

export function SpotDialog({ spot, assist, go, onClose }: { spot: CardSpot; assist: Assist; go: Go; onClose: () => void }) {
  const [text, setText] = useState('')
  const [asking, setAsking] = useState(true)
  const jobs = assist.jobs.filter((j) => j.ask?.scope === 'card' && j.ask.anchor === spot.id)
  const save = async () => { if (text.trim() && await assist.addNote(text.trim(), spot.place)) onClose() }
  return (
    <Dialog title={`${spot.mode === 'note' ? 'Note on' : 'Ask about'} ${spot.title}`} width={560} onClose={onClose}
      actions={spot.mode === 'note' ? <>
        <Button className="flex-1" onClick={onClose}>Cancel</Button>
        <Button kind="primary" className="flex-1" disabled={!text.trim()} onClick={() => void save()}>Add note</Button>
      </> : undefined}>
      {spot.mode === 'note' ? (
        <div className="px-5">
          <textarea autoFocus value={text} onChange={(e) => setText(e.target.value)} rows={3} aria-label="Note"
            placeholder="A to-do or a comment"
            className="block w-full resize-none rounded-lg bg-soft px-3 py-2 outline-none placeholder:text-faint focus:ring-1 focus:ring-accent" />
          <p className="mt-2 text-xs text-dim">Kept next to the paper in .git, never committed or pushed.</p>
        </div>
      ) : (
        <div className="px-3">
          {jobs.map((j) => <Thread key={j.id} job={j} go={go} here={spot.here} className="my-2.5"
            onNote={(t) => void assist.addNote(t, spot.place)} onMore={() => setAsking(true)}
            onCancel={() => assist.cancel(j.id)} onClose={() => assist.forget(j.id)} />)}
          {asking && <AskBox title={spot.title} choice={assist.choice} onClose={jobs.length ? () => setAsking(false) : onClose}
            onAsk={(question, pick) => {
              assist.ask({ question, about: spot.about, scope: 'card', anchor: spot.id, title: spot.title }, pick ?? undefined)
              setAsking(false)
            }} />}
        </div>
      )}
    </Dialog>
  )
}
