import { ArrowLeftRight, ArrowRight } from 'lucide-react'
import type { ReactNode } from 'react'

import type { Changes } from '../../../../types/history'
import { plural } from '../format'
import { VersionPicker } from '../Pickers'
import { Avatar } from '../ui/Avatar'
import { Counts } from '../ui/Counts'
import { AskButton } from './AskButton'
import type { DetailProps } from './Detail'

export function CompareHead(p: DetailProps & { from: string; to: string; changes: Changes | null; switcher: ReactNode
  onAsk: () => void }) {
  const { from, to, commits, refs, state } = p
  const lo = from === '' ? -1 : commits.findIndex((c) => c.hash === from)
  const hi = to === '' ? -1 : commits.findIndex((c) => c.hash === to)
  const between = lo >= 0 ? commits.slice(Math.max(0, hi), lo) : []
  const authors = [...new Set(between.map((c) => c.author))]
  const names = authors.length > 1 ? `${authors.slice(0, -1).join(', ')} and ${authors[authors.length - 1]}` : authors[0]
  return (
    <div className="shrink-0 border-b border-line px-6 pt-3.5 pb-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-lg text-dim">Compare</span>
        <VersionPicker value={from} commits={commits} refs={refs} head={state.head} allowNow={false}
          onPick={(v) => p.onSel({ kind: 'compare', from: v, to })} onPickInList={() => p.onPickInList('from')} />
        <ArrowRight size={16} className="text-dim" />
        <VersionPicker value={to} commits={commits} refs={refs} head={state.head} allowNow
          onPick={(v) => p.onSel({ kind: 'compare', from, to: v })} onPickInList={() => p.onPickInList('to')} />
        {to !== '' && <button onClick={() => p.onSel({ kind: 'compare', from: to, to: from })} aria-label="Swap"
          title="Swap" className="grid size-8 place-items-center rounded-md text-dim hover:bg-hover"><ArrowLeftRight size={15} /></button>}
        <span className="flex-1" />
        <AskButton onClick={p.onAsk} label="Ask about these changes" />
        {p.switcher}
      </div>
      <div className="mt-2 flex items-center gap-2 text-sm text-dim">
        <span className="flex -space-x-1">{authors.slice(0, 4).map((a) => <Avatar key={a} name={a} size={20} />)}</span>
        {(between.length > 0 || to === '') && <span>{between.length > 0 ? `${plural(between.length, 'commit')} by ${names}${
          to === '' && state.changes.length ? ', plus your changes' : ''}` : 'Your changes not committed yet'} ·</span>}
        {p.changes && <span>{plural(p.changes.files.length, 'file')} <Counts added={p.changes.added}
          removed={p.changes.removed} /></span>}
      </div>
    </div>
  )
}
