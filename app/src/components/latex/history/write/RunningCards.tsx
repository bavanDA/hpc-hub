import type { Assist } from '../useAssist'
import { RunningCard } from './RunningCard'

/** Bottom right while jobs run, wherever you are in the paper. */
export function RunningCards({ assist, inHistory }: { assist: Assist; inHistory: boolean }) {
  const shown = assist.jobs.filter((j) => ['starting', 'preparing', 'running'].includes(j.stage)
    && (j.kind !== 'ask' || (!inHistory && j.ask?.scope !== 'card')))
  if (!shown.length) return null
  return (
    <div className="pointer-events-none fixed right-4 bottom-4 z-40 flex w-[400px] flex-col gap-2">
      {shown.map((j) => <RunningCard key={j.id} job={j} onCancel={() => assist.cancel(j.id)} />)}
    </div>
  )
}
