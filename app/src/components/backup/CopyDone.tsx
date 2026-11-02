// The copy while it runs (progress, Stop with a question) and what it ended with: done, partly done, or files
// that still do not match. Desktop.
import { CircleAlert, CircleCheck, FileText } from 'lucide-react'
import { useState } from 'react'

import type { CopyResult, Plan, Progress } from '../../types/backup'
import { AlertDialog, Button, Card, IconTile, Meter, Spinner } from '../ui'
import { copying, count, done as copy, gb, helpFor } from './copy'

export function CopyView({ plan, progress, job, onStop }: {
  plan: Plan | null; progress: Progress | null; job: string; onStop: () => void
}) {
  const [asking, setAsking] = useState(false)
  const total = progress?.total_bytes || plan?.bytes || 0
  const share = total ? (progress?.done_bytes ?? 0) / total : 0
  return (
    <Card className="flex flex-col gap-4 p-6">
      <div className="flex items-center gap-3"><Spinner size={20} />
        <h2 className="text-lg font-semibold">{copying.title(gb(total))}</h2></div>
      <Meter value={share} label="Copied" />
      <p className="text-md text-dim tabular-nums">
        {progress?.state === 'verifying' ? copying.verifying : progress?.detail || 'Starting'}</p>
      {job && <p className="text-sm text-dim">{copying.job(job)}</p>}
      <div><Button onClick={() => setAsking(true)}>{copying.stop}</Button></div>
      {asking && <AlertDialog title={copying.stopTitle} keep={copying.keep} act={copying.stop}
        onAct={() => { setAsking(false); onStop() }} onClose={() => setAsking(false)}>
        <p>{copying.stopText}</p></AlertDialog>}
    </Card>
  )
}

export function DoneView({ cluster, result, onOpen, onWeekly, onAgain, onNewCheck }: {
  cluster: string; result: CopyResult | null; onOpen: () => void; onWeekly: () => void; onAgain: () => void
  onNewCheck: () => void
}) {
  if (!result) return <div className="grid h-40 place-items-center"><Spinner size={20} /></div>
  const busy = result.busy.length
  const failed = result.failed.length
  const bad = result.mismatches > 0
  const partial = busy + failed > 0
  return (
    <div className="flex flex-col gap-5">
      <Card className="flex flex-col gap-4 p-6">
        <div className="flex items-start gap-4">
          <IconTile icon={bad ? CircleAlert : CircleCheck} size={56} />
          <div className="flex flex-col gap-1.5">
            <h2 className="text-xl font-semibold">{bad ? copy.mismatch(result.mismatches)
              : partial ? copy.partial(result.copied_files, result.copied_files + busy + failed)
                : copy.title(result.copied_files)}</h2>
            <p className="text-md text-dim">{bad ? copy.mismatchHelp(helpFor(cluster)) : copy.checked(result.verified)}</p>
            {busy > 0 && <p className="text-md text-dim">{copy.busy(busy)}</p>}
            {failed > 0 && <p className="text-md text-dim">{copy.failed(failed)}</p>}
          </div>
        </div>
        {result.notes_path && (
          <p className="flex items-center gap-2 text-sm text-dim"><FileText size={14} />{copy.notes}
            <span className="font-mono">{result.notes_path.split('/').slice(-2).join('/')}</span></p>
        )}
        <div className="flex flex-wrap gap-3">
          {bad ? <Button kind="primary" onClick={onAgain}>{copy.again}</Button>
            : <Button kind="primary" onClick={onOpen}>{copy.open}</Button>}
          <Button onClick={onWeekly}>{copy.weekly}</Button>
          <Button kind="ghost" onClick={onNewCheck}>{copy.newCheck}</Button>
        </div>
      </Card>
      {partial && (
        <Card className="divide-y divide-line overflow-hidden">
          {result.busy.map((p) => <div key={p} className="flex min-h-11 items-center gap-3 px-4">
            <span className="flex-1 truncate font-mono text-sm">{p}</span>
            <span className="text-sm text-dim">Busy</span></div>)}
          {result.failed.map((f) => <div key={f.path} className="flex min-h-11 items-center gap-3 px-4">
            <span className="flex-1 truncate font-mono text-sm">{f.path}</span>
            <span className="text-sm text-dim">{f.why}</span></div>)}
        </Card>
      )}
      <p className="text-sm text-dim tabular-nums">{count(result.copied_files)} files, {gb(result.bytes)}</p>
    </div>
  )
}
