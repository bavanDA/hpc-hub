// P1, safe push: pull first, every time. The steps as they run; when your commit and a co-author's touch the same
// spot it stops before anything is sent, shows the spot side by side, and you keep yours, theirs, both, or edit.
import { ArrowUp, FileText, RefreshCw, ShieldCheck } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'

import type { Pick, Spot, Step, SyncState } from '../../../types/history'
import { Button } from '../../ui'
import { Avatar, plural, Segments } from './bits'
import { Steps } from './Branches'
import { Tex } from './DiffView'

type Props = {
  push: boolean
  steps: Step[]
  running: boolean
  paused: SyncState | null
  error: string
  busy: boolean
  onStop: () => void
  onContinue: (picks: Record<string, Pick[]>) => void
  onRetry: () => void
  onOpen: (path: string, line: number) => void
}

const key = (s: Spot) => `${s.path}#${s.index}`

export function PushView({ push, steps, running, paused, error, busy, onStop, onContinue, onRetry, onOpen }: Props) {
  const [picks, setPicks] = useState<Record<string, Pick>>({})
  const [at, setAt] = useState(0)
  const spots = useMemo(() => paused?.spots ?? [], [paused])
  useEffect(() => { setPicks({}); setAt(0) }, [spots])
  const theirs = spots[0]?.theirs_commit?.author || paused?.pulled_by || 'origin'
  const settled = spots.length > 0 && spots.every((s) => picks[key(s)])
  const verb = push ? 'push' : 'update'
  const todo = paused ? (paused.stage === 'pull'
    ? [...(push ? [`Push your ${plural(Math.max(1, paused.pushed || 1), 'commit')}`] : []),
      ...(paused.changes ? ['Bring your changes back'] : [])] : []) : []
  const pulledLabel = paused?.pulled ? `Pulled ${plural(paused.pulled, 'commit')} from origin${paused.pulled_by
    ? `: ${paused.pulled_by}` : ''}` : ''
  const shownSteps = paused ? steps.map((s) => ({ ...s, done: true,
    label: s.label === 'Get the latest from origin' && pulledLabel ? pulledLabel : s.label })) : steps
  const stopLabel = paused ? `Your commit and ${theirs}'s both changed ${plural(spots.length, 'spot')}` : undefined
  const continueAll = () => {
    const byFile: Record<string, Pick[]> = {}
    for (const s of spots) (byFile[s.path] ??= [])[s.index] = picks[key(s)]
    onContinue(byFile)
  }
  const spot = spots[at]
  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <div className="flex items-center gap-3 px-6 pt-5">
        {push ? <ArrowUp size={20} /> : <RefreshCw size={18} />}
        <h2 className="min-w-0 flex-1 text-xl font-semibold">{push ? 'Push to origin' : 'Get the latest from origin'}</h2>
        {(paused || error) && <Button kind="ghost" onClick={onStop} disabled={busy}>Stop and put everything back</Button>}
        {paused && <Button kind="primary" onClick={continueAll} disabled={!settled || busy}>
          {push ? <><ArrowUp size={15} /> Continue push</> : 'Continue'}</Button>}
        {error && !paused && <Button kind="primary" onClick={onRetry} disabled={busy}>Try again</Button>}
      </div>
      <p className="max-w-[760px] px-6 pt-2 text-dim">
        {push ? 'Before every push, HPC Hub pulls first so you never overwrite a co-author.'
          : 'Your commits go on top of what came in, and your changes come back after.'}
        {paused ? ` ${spots.length === 1 ? 'One spot needs' : `${spots.length} spots need`} you.` : ''}
        {paused?.stage === 'pull' && push ? ' Nothing has been pushed yet.' : ''}
        {paused?.stage === 'back' ? ' Your commit is pushed; this is about your changes not committed yet.' : ''}</p>
      <div className="max-w-[620px] px-6 pt-4">
        <Steps steps={shownSteps} todo={running ? [] : todo} stopped={stopLabel} />
        {running && !steps.length && <p className="text-dim">Starting the {verb}…</p>}
        {error && <p className="mt-3 text-bad">{error}</p>}
      </div>
      {spot && (
        <div className="mt-5 border-t border-line px-6 pt-5 pb-8">
          <div className="flex items-center gap-2 text-sm">
            <span className="font-mono font-semibold">{spot.path}</span>
            <span className="text-dim">line {spot.line} · spot {at + 1} of {spots.length}
              {picks[key(spot)] ? ` · you picked ${label(picks[key(spot)].take, theirs)}` : ''}</span>
            <span className="flex-1" />
            {spots.length > 1 && <>
              <Button size="sm" kind="ghost" disabled={at === 0} onClick={() => setAt(at - 1)}>Previous spot</Button>
              <Button size="sm" kind="ghost" disabled={at === spots.length - 1} onClick={() => setAt(at + 1)}>Next spot</Button>
            </>}
            <button onClick={() => onOpen(spot.path, spot.line)}
              className="flex h-8 items-center gap-1.5 rounded-md px-2 font-semibold hover:bg-hover">
              <FileText size={14} /> Open in Editor</button>
          </div>
          <SpotView spot={spot} theirs={theirs} pick={picks[key(spot)]}
            onPick={(p) => setPicks({ ...picks, [key(spot)]: p })} />
          <div className="mt-6 flex max-w-[880px] items-start gap-3 rounded-xl bg-inset p-4 text-sm">
            <ShieldCheck size={18} className="mt-0.5 shrink-0" />
            <span>{paused && paused.changes > 0
              ? `Your ${plural(paused.changes, 'change')} not committed yet ${paused.changes === 1 ? 'is' : 'are'} safe while this is open. `
              : ''}{paused?.stage === 'back'
              ? 'Stop puts the files back as they were pushed; your changes stay in Saved versions.'
              : 'Stop undoes the pull and gives you back your commits and your changes exactly as they were.'}</span>
          </div>
        </div>
      )}
    </div>
  )
}

function label(take: Pick['take'], theirs: string) {
  return take === 'mine' ? 'Keep mine' : take === 'theirs' ? `Keep ${theirs}'s` : take === 'both' ? 'Keep both' : 'Edit'
}

function SpotView({ spot, theirs, pick, onPick }:
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
          {spot.before.map((t, i) => <Code key={`b${i}`} n={spot.line - spot.before.length + i} t={t} />)}
          {rows.map((t, i) => <Code key={i} n={spot.line + i} t={t} changed />)}
          {spot.after.slice(0, 1).map((t, i) => <Code key={`a${i}`} n={spot.line + rows.length + i} t={t} />)}
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
            {result.map((t, i) => <Code key={i} n={spot.line + i} t={t} />)}</div>
        </div>
      )}
      {spot.theirs_commit && <p className="mt-2 text-xs text-dim">{theirs}'s change came in with
        "{spot.theirs_commit.subject}".</p>}
    </>
  )
}

function Code({ n, t, changed }: { n: number; t: string; changed?: boolean }) {
  return (
    <div className={`flex ${changed ? 'diff-add' : ''}`}>
      <span className="w-11 shrink-0 pr-3 text-right text-faint select-none">{n}</span>
      <span className="min-w-0 flex-1 pr-3 break-words whitespace-pre-wrap"><Tex text={t} /></span>
    </div>
  )
}
