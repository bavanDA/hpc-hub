// Ask and Notes, from the Notes button in History or an Ask on a change: the Ask box, the answers so far, then the
// notes. Back returns to the commit list.
import { Thread } from '@shared/components/latex/history/ask/Thread'
import type { Go } from '@shared/components/latex/history/go'
import type { Assist } from '@shared/components/latex/history/useAssist'
import type { About, NotePlace } from '@shared/types/history'
import { useBackLayer } from '../../../nav'
import { AskBox } from './AskBox'
import { NotesList } from './NotesList'

export type AskOpen = { about: About; title: string }

export function AssistView({ assist, go, asking, onAskClose, onAskMore, focus, onClose }: { assist: Assist
  go: Go & { place: (p: NotePlace) => void }; asking: AskOpen | null; onAskClose: () => void
  onAskMore: (a: AskOpen) => void; focus: string; onClose: () => void }) {
  useBackLayer(onClose)
  const asks = assist.jobs.filter((j) => j.kind === 'ask' && j.ask?.scope === 'history').reverse()
  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      {(asking || asks.length > 0) && <div className="px-3">
        {asking && <AskBox key={asking.title} title={asking.title} choice={assist.choice} onClose={onAskClose}
          onAsk={(question, pick) => {
            assist.ask({ question, about: asking.about, scope: 'history', anchor: 'top', title: asking.title }, pick ?? undefined)
            onAskClose()
          }} />}
        {asks.map((j) => <Thread key={j.id} job={j} go={go} className="mb-2.5"
          onNote={(t) => void assist.addNote(t, j.ask?.about.kind === 'lines' ? { path: j.ask.about.path, line: j.ask.about.line }
            : j.ask?.about.kind === 'commit' ? { hash: j.ask.about.hash } : null)}
          onMore={() => j.ask && onAskMore({ about: j.ask.about, title: j.ask.title })} onCancel={() => assist.cancel(j.id)} onClose={() => assist.forget(j.id)} />)}
      </div>}
      {(asking || asks.length > 0) && <div className="h-1.5 bg-soft" />}
      <NotesList assist={assist} focus={focus} go={go} />
    </div>
  )
}
