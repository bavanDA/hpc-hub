import { BellRing, CircleAlert, CircleCheck, FileText } from 'lucide-react'
import { useState } from 'react'

import type { CopyResult, Plan, Progress } from '../../types/backup'
import { Confirm } from '../e/Confirm'
import { EButton } from '../e/EButton'
import { ItemRow } from '../e/ItemRow'
import { List } from '../e/List'
import { Row } from '../e/Row'
import { Section } from '../e/Section'
import { Spinner } from '../ui/Spinner'
import { Actions } from './Actions'
import { Bar } from './Bar'
import { copying, done as copy } from './copy'
import { count, gb } from './format'
import { helpFor } from './help'

export function CopyView({ plan, progress, job, onStop }: {
  plan: Plan | null; progress: Progress | null; job: string; onStop: () => void
}) {
  const [asking, setAsking] = useState(false)
  const total = progress?.total_bytes || plan?.bytes || 0
  const share = total ? (progress?.done_bytes ?? 0) / total : 0
  return (
    <div className="flex flex-col gap-3">
      <h2 className="flex items-center gap-3 px-5 text-lg font-semibold"><Spinner size={18} />
        {copying.title(gb(total))}</h2>
      <div className="px-5"><Bar value={share} label="Copied" /></div>
      <p className="px-5 text-dim tabular-nums">
        {progress?.state === 'verifying' ? copying.verifying : progress?.detail || 'Starting'}</p>
      {job && <p className="px-5 text-sm text-dim">{copying.job(job)}</p>}
      <Actions><EButton onClick={() => setAsking(true)}>{copying.stop}</EButton></Actions>
      {asking && <Confirm title={copying.stopTitle} keep={copying.keep} act={copying.stop}
        onAct={() => { setAsking(false); onStop() }} onClose={() => setAsking(false)}>
        <p>{copying.stopText}</p></Confirm>}
    </div>
  )
}

export function DoneView({ cluster, result, onOpen, onWeekly, onAgain }: {
  cluster: string; result: CopyResult | null; onOpen: () => void; onWeekly: () => void; onAgain: () => void
}) {
  if (!result) return <div className="grid h-40 place-items-center"><Spinner size={20} /></div>
  const busy = result.busy.length
  const failed = result.failed.length
  const bad = result.mismatches > 0
  const partial = busy + failed > 0
  return (
    <>
      <div className="flex flex-col gap-1.5 px-5">
        <h2 className={`flex items-start gap-2 text-xl font-semibold ${bad ? 'text-bad' : ''}`}>
          {bad ? <CircleAlert size={22} className="mt-0.5 shrink-0" /> : <CircleCheck size={22} className="mt-0.5 shrink-0" />}
          {bad ? copy.mismatch(result.mismatches)
            : partial ? copy.partial(result.copied_files, result.copied_files + busy + failed)
              : copy.title(result.copied_files)}</h2>
        <p className="text-md text-dim">{bad ? copy.mismatchHelp(helpFor(cluster)) : copy.checked(result.verified)}</p>
        {busy > 0 && <p className="text-md text-dim">{copy.busy(busy)}</p>}
        {failed > 0 && <p className="text-md text-dim">{copy.failed(failed)}</p>}
        <p className="text-sm text-dim tabular-nums">{count(result.copied_files)} files, {gb(result.bytes)}</p>
      </div>
      <div className="pt-5"><List>
        {result.notes_path && <ItemRow icon={FileText} label="Notes on what was copied and left out"
          sub={<span className="font-mono break-all">{result.notes_path.split('/').slice(-2).join('/')}</span>} />}
        <ItemRow icon={BellRing} label={copy.weekly} onPress={onWeekly} />
      </List></div>
      {partial && <Section title="Not copied">
        {[...result.busy.map((p) => [p, 'A job was still writing it']),
          ...result.failed.map((x) => [x.path, x.why])].map(([p, why]) => (
          <Row key={p} label={<span className="font-mono text-sm break-all">{p}</span>} sub={why} />
        ))}
      </Section>}
      <Actions>
        {bad ? <EButton kind="primary" onClick={onAgain}>{copy.again}</EButton>
          : <EButton kind="primary" onClick={onOpen}>{copy.open}</EButton>}
      </Actions>
    </>
  )
}
