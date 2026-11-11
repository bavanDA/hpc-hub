// Queues: the desktop's table as rows that fit a phone: how many CPUs are busy, then GPUs and the jobs running and
// waiting on one line under the bar.
import { Bar } from '@shared/components/usage/Bar'
import { n, pct } from '@shared/components/usage/format'
import { Section } from '@shared/components/usage/Section'
import { List } from '@shared/components/ui/List'
import type { Partition } from '@shared/types/usage'

export function QueueList({ parts, error }: { parts: Partition[] | null; error: string }) {
  const busy = (parts ?? []).reduce((s, p) => s + p.cpus_used, 0)
  const total = (parts ?? []).reduce((s, p) => s + p.cpus_total, 0)
  const note = error ? `Could not load: ${error}` : !parts ? 'Loading…'
    : `${n(busy)} of ${n(total)} CPUs busy (${pct(busy, total)}).`
  return (
    <Section note={note}>
      {parts && parts.length > 0 && <List>
        {parts.map((p) => (
          <div key={p.name} className="flex flex-col gap-1.5 px-4 py-2.5">
            <div className="flex items-baseline gap-3">
              <span className={`min-w-0 flex-1 [overflow-wrap:anywhere] ${p.up ? '' : 'text-dim'}`}>
                {p.name}{!p.up && ' (down)'}</span>
              <span className="text-sm text-dim tabular-nums">{n(p.nodes)} nodes</span>
            </div>
            <Bar value={p.cpus_total ? p.cpus_used / p.cpus_total : 0} className="w-full" />
            <div className="text-sm text-dim tabular-nums">
              {n(p.cpus_used)} of {n(p.cpus_total)} CPUs · {pct(p.cpus_used, p.cpus_total)}
              {p.gpus_total > 0 && ` · ${p.gpus_used} of ${p.gpus_total} GPUs`}
              {` · ${n(p.running)} running · `}
              <span className={p.pending > p.running ? 'font-semibold text-text' : ''}>{n(p.pending)} waiting</span>
            </div>
          </div>
        ))}
      </List>}
    </Section>
  )
}
