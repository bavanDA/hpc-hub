import { ArrowUp, FileText, RefreshCw, ShieldCheck } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'

import type { Pick, Step, SyncState } from '../../../../types/history'
import { Button } from '../../../ui'
import { Steps } from '../branches/Steps'
import { plural } from '../format'
import { pickLabel, spotKey } from './picks'
import { SpotView } from './SpotView'

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


export function PushView({ push, steps, running, paused, error, busy, onStop, onContinue, onRetry, onOpen }: Props) {
  const [picks, setPicks] = useState<Record<string, Pick>>({})
  const [at, setAt] = useState(0)
  const spots = useMemo(() => paused?.spots ?? [], [paused])
  useEffect(() => { setPicks({}); setAt(0) }, [spots])
  const theirs = spots[0]?.theirs_commit?.author || paused?.pulled_by || 'origin'
  const settled = spots.length > 0 && spots.every((s) => picks[spotKey(s)])
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
    for (const s of spots) (byFile[s.path] ??= [])[s.index] = picks[spotKey(s)]
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
              {picks[spotKey(spot)] ? ` · you picked ${pickLabel(picks[spotKey(spot)].take, theirs)}` : ''}</span>
            <span className="flex-1" />
            {spots.length > 1 && <>
              <Button size="sm" kind="ghost" disabled={at === 0} onClick={() => setAt(at - 1)}>Previous spot</Button>
              <Button size="sm" kind="ghost" disabled={at === spots.length - 1} onClick={() => setAt(at + 1)}>Next spot</Button>
            </>}
            <button onClick={() => onOpen(spot.path, spot.line)}
              className="flex h-8 items-center gap-1.5 rounded-md px-2 font-semibold hover:bg-hover">
              <FileText size={14} /> Open in Editor</button>
          </div>
          <SpotView spot={spot} theirs={theirs} pick={picks[spotKey(spot)]}
            onPick={(p) => setPicks({ ...picks, [spotKey(spot)]: p })} />
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
