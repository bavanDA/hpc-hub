import type { Scan } from '../../types/backup'
import { EButton } from '../e/EButton'
import { Spinner } from '../ui/Spinner'
import { Actions } from './Actions'
import { Bar } from './Bar'
import { scanning, start } from './copy'
import { count } from './format'

export function ScanningStep({ scan, onStop, onAgain }: { scan: Scan | null; onStop: () => void; onAgain: () => void }) {
  const p = scan?.progress ?? {}
  const share = p.expected ? (p.checked ?? 0) / p.expected : 0
  const failed = scan?.state === 'failed'
  return (
    <div className="flex flex-col gap-3">
      <h2 className="flex items-center gap-3 px-5 text-lg font-semibold">{!failed && <Spinner size={18} />}
        {failed ? scanning.failed : scanning.title}</h2>
      {scan?.state === 'scanning' && p.expected
        ? <div className="px-5"><Bar value={share} label="Files checked" /></div> : null}
      <p className="px-5 text-dim tabular-nums">{scan?.detail || (p.expected
        ? `${count(p.checked ?? 0)} of about ${count(p.expected)} files` : 'Waiting for a node')}</p>
      {!failed && <p className="px-5 text-sm text-dim">{start.hint}</p>}
      <Actions>{failed ? <EButton kind="primary" onClick={onAgain}>{scanning.again}</EButton>
        : <EButton onClick={onStop}>Stop checking</EButton>}</Actions>
    </div>
  )
}
