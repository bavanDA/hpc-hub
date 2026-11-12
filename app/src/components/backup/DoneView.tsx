import { BellRing, CircleAlert, CircleCheck, FileText } from 'lucide-react'

import type { CopyResult } from '../../types/backup'
import { useClusters } from '../clusters/store'
import { EButton } from '../e/EButton'
import { ItemRow } from '../e/ItemRow'
import { List } from '../e/List'
import { Row } from '../e/Row'
import { Section } from '../e/Section'
import { Spinner } from '../ui/Spinner'
import { Actions } from './Actions'
import { done as copy } from './copy'
import { count, gb } from './format'
import { helpFor } from './help'

export function DoneView({ cluster, result, onOpen, onWeekly, onAgain }: {
  cluster: string; result: CopyResult | null; onOpen: () => void; onWeekly: () => void; onAgain: () => void
}) {
  const { clusters } = useClusters()
  const helpEmail = clusters?.find((c) => c.id === cluster)?.help_email
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
        <p className="text-md text-dim">{bad ? copy.mismatchHelp(helpFor(helpEmail)) : copy.checked(result.verified)}</p>
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
