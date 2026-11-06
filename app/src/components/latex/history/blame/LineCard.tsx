import { ArrowLeft, Copy, History as HistoryIcon, ScrollText } from 'lucide-react'
import { useEffect, useState } from 'react'

import type { LineStory } from '../../../../types/history'
import { Spinner } from '../../../ui/Spinner'
import { useToast } from '../../../useToast'
import { Tex } from '../diff/Tex'
import { fullDate, lastLine, plural, when } from '../format'
import { git, type Where } from '../git'
import { Avatar } from '../ui/Avatar'
import { CardAction } from './CardAction'
import { CardClose } from './CardClose'

type Step = { path: string; line: number; at: string }

export function LineCard({ where, start, x, y, onClose, onPdf, onHistory }:
  { where: Where; start: Step; x: number; y: number; onClose: () => void
    onPdf: (line: number) => void; onHistory: (hash: string) => void }) {
  const toast = useToast()
  const [trail, setTrail] = useState<Step[]>([start])
  const [got, setGot] = useState<{ step: Step; story?: LineStory; error?: string } | null>(null)
  const step = trail[trail.length - 1]
  useEffect(() => {
    git<LineStory>('line', where, { path: step.path, line: step.line, at: step.at })
      .then((story) => setGot({ step, story }))
      .catch((e: Error) => setGot({ step, error: lastLine(e.message) }))
  }, [where, step])
  const story = got?.step === step ? got.story ?? null : null
  const error = got?.step === step ? got.error ?? '' : ''
  useEffect(() => {
    const key = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', key)
    return () => window.removeEventListener('keydown', key)
  }, [onClose])
  const left = Math.min(x + 12, window.innerWidth - 460), top = Math.min(y - 20, window.innerHeight - 330)
  const s = story && !story.uncommitted ? story : null
  return (
    <div style={{ left, top }} onMouseDown={(e) => e.stopPropagation()}
      className="menu-in fixed z-40 w-[440px] rounded-xl border border-line bg-raised p-4 shadow-[var(--shadow-dialog)]">
      {!story && !error && <div className="grid h-24 place-items-center"><Spinner /></div>}
      {error && <p className="text-bad">{error}</p>}
      {story?.uncommitted && <>
        <div className="flex items-start"><b className="flex-1">Not committed yet</b><CardClose onClose={onClose} /></div>
        <p className="mt-1 text-sm text-dim">You changed this line since your last commit. It goes in with your next
          commit.</p>
        <div className="mt-3 flex gap-2">
          <CardAction icon={<ScrollText size={14} />} label="Show in PDF" solid onClick={() => onPdf(start.line)} />
          <CardAction icon={<HistoryIcon size={14} />} label="Open in History" onClick={() => onHistory('')} />
        </div>
      </>}
      {s && <>
        <div className="flex items-start gap-2.5">
          <Avatar name={s.commit.author} size={26} />
          <div className="min-w-0 flex-1 leading-tight">
            <div><b>{s.commit.author}</b> <span className="text-dim">· {when(s.commit.time)}</span></div>
            <div className="text-xs text-dim">{fullDate(s.commit.time)}</div>
          </div>
          <button onClick={() => navigator.clipboard.writeText(s.commit.hash).then(() => toast('Commit id copied'))
            .catch(() => {})} className="flex items-center gap-1 rounded bg-pill px-1.5 font-mono text-xs hover:bg-pressed">
            {s.commit.short} <Copy size={11} /></button>
          <CardClose onClose={onClose} />
        </div>
        <div className="mt-3 font-semibold">{s.commit.subject}</div>
        {s.commit.body && <p className="mt-1 line-clamp-4 text-sm whitespace-pre-line text-dim">{s.commit.body}</p>}
        {s.rows.length > 0 && (
          <div className="mt-3 overflow-hidden rounded-lg border border-line font-mono text-xs leading-[19px]">
            {s.rows.map((r, i) => (
              <div key={i} className={`flex gap-2 px-2 ${r.k === '-' ? 'diff-del' : 'diff-add'}`}>
                <span className="w-3 shrink-0 text-dim">{r.k}</span>
                <span className="min-w-0 flex-1 break-words whitespace-pre-wrap"><Tex text={r.t} marks={r.m}
                  markClass={r.k === '-' ? 'diff-del-mark' : 'diff-add-mark'} /></span>
              </div>
            ))}
            {s.more > 0 && <div className="px-2 py-0.5 font-sans text-dim">and {plural(s.more, 'more line')} in this
              commit</div>}
          </div>
        )}
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {trail.length === 1 && <CardAction icon={<ScrollText size={14} />} label="Show in PDF" solid
            onClick={() => onPdf(start.line)} />}
          {trail.length > 1 && <CardAction icon={<ArrowLeft size={14} />} label="Newer" onClick={() => setTrail(trail.slice(0, -1))} />}
          <CardAction icon={<HistoryIcon size={14} />} label="Open in History" onClick={() => onHistory(s.commit.hash)} />
          <span className="flex-1" />
          {s.older && <CardAction icon={<ArrowLeft size={14} />} label="Older change"
            onClick={() => setTrail([...trail, { path: s.older!.path, line: s.older!.line, at: s.older!.rev }])} />}
        </div>
        <p className="mt-3 border-t border-line pt-2.5 text-sm text-dim">{s.older
          ? <>Before this, the line came from <b className="text-text">{s.older.subject}</b> by {s.older.author},
            {' '}{when(s.older.time)}.</>
          : 'This is the commit that wrote the line first.'}</p>
      </>}
    </div>
  )
}
