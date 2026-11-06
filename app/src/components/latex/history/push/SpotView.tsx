import { useEffect, useState } from 'react'

import type { Pick, Spot } from '../../../../types/history'
import { Avatar } from '../ui/Avatar'
import { Segments } from '../ui/Segments'
import { CodeLine } from './CodeLine'

export function SpotView({ spot, theirs, pick, onPick }:
  { spot: Spot; theirs: string; pick: Pick | undefined; onPick: (p: Pick) => void }) {
  const [text, setText] = useState(spot.mine.join('\n'))
  useEffect(() => setText(spot.mine.join('\n')), [spot])
  const result = !pick ? null : pick.take === 'mine' ? spot.mine : pick.take === 'theirs' ? spot.theirs
    : pick.take === 'both' ? [...spot.mine, ...spot.theirs] : (pick.text ?? '').split('\n')
  const side = (who: 'mine' | 'theirs') => {
    const rows = spot[who], c = who === 'mine' ? spot.mine_commit : spot.theirs_commit
    const on = pick?.take === who
    return (
      <button onClick={() => onPick({ take: who })}
        className={`min-w-0 flex-1 overflow-hidden rounded-xl border text-left ${on ? 'border-text ring-1 ring-text'
          : 'border-line-strong hover:bg-hover'}`}>
        <div className="flex h-10 items-center gap-2 border-b border-line px-3 text-sm">
          <Avatar name={who === 'mine' ? (c?.author ?? 'you') : theirs} size={20} />
          <span className="font-semibold">{who === 'mine' ? 'Yours' : `${theirs}'s`}</span>
          <span className="min-w-0 flex-1 truncate text-dim">{c?.subject ?? ''}</span>
          <span className={`grid size-[18px] place-items-center rounded-full border-2 ${on ? 'border-text' : 'border-line-strong'}`}>
            {on && <span className="size-2 rounded-full bg-text" />}</span>
        </div>
        <div className="py-1 font-mono text-[13px] leading-[19px]">
          {spot.before.map((t, i) => <CodeLine key={`b${i}`} n={spot.line - spot.before.length + i} t={t} />)}
          {rows.map((t, i) => <CodeLine key={i} n={spot.line + i} t={t} changed />)}
          {spot.after.slice(0, 1).map((t, i) => <CodeLine key={`a${i}`} n={spot.line + rows.length + i} t={t} />)}
        </div>
      </button>
    )
  }
  return (
    <>
      <div className="mt-3 flex gap-3">{side('mine')}{side('theirs')}</div>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <Segments value={pick?.take ?? ('' as Pick['take'])} onChange={(take) => onPick(take === 'edit'
          ? { take, text } : { take })} options={[['mine', 'Keep mine'], ['theirs', `Keep ${theirs}'s`], ['both', 'Keep both'],
          ['edit', 'Edit']]} />
        <span className="flex-1" />
        <span className="text-sm text-dim">Tip: Edit lets you take {theirs}'s wording and keep your own changes.</span>
      </div>
      {pick?.take === 'edit' ? (
        <textarea value={text} onChange={(e) => { setText(e.target.value); onPick({ take: 'edit', text: e.target.value }) }}
          rows={Math.max(3, text.split('\n').length + 1)} aria-label="The lines as they should read"
          className="mt-4 w-full max-w-[880px] rounded-lg border border-line-strong bg-view p-2 font-mono text-[13px]
            outline-none focus:border-accent" />
      ) : result && (
        <div className="mt-4 max-w-[880px]">
          <div className="mb-1 text-xs font-semibold tracking-wide text-dim uppercase">
            {result.length === 1 ? `Line ${spot.line} will read` : `Lines ${spot.line} to ${spot.line + result.length - 1} will read`}</div>
          <div className="rounded-lg border border-line-strong py-1 font-mono text-[13px] leading-[19px]">
            {result.map((t, i) => <CodeLine key={i} n={spot.line + i} t={t} />)}</div>
        </div>
      )}
      {spot.theirs_commit && <p className="mt-2 text-xs text-dim">{theirs}'s change came in with
        "{spot.theirs_commit.subject}".</p>}
    </>
  )
}
