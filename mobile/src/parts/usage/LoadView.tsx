// Load: how busy each partition is, one card each: CPUs in use as a bar, GPUs, jobs running and waiting.
import { n, pct } from '@shared/components/usage/format'
import { Bar } from '@shared/components/usage/parts'
import type { Partition } from '@shared/types/usage'
import { Card } from '../../ui'

export function LoadView({ name, parts }: { name: string; parts: Partition[] }) {
  const busy = parts.reduce((s, p) => s + p.cpus_used, 0)
  const total = parts.reduce((s, p) => s + p.cpus_total, 0)
  return (
    <div className="flex flex-col gap-3">
      <p className="text-dim">{name}: {n(busy)} of {n(total)} CPUs busy ({pct(busy, total)}). Many jobs waiting means
        a long queue.</p>
      {parts.map((p) => (
        <Card key={p.name}>
          <div className="flex items-baseline gap-2">
            <span className={`min-w-0 flex-1 truncate font-semibold ${p.up ? '' : 'text-dim'}`}>
              {p.name}{!p.up && ' (down)'}</span>
            <span className="text-sm text-dim">{n(p.nodes)} nodes</span>
          </div>
          <Bar value={p.cpus_total ? p.cpus_used / p.cpus_total : 0} className="mt-2 w-full" />
          <p className="mt-1.5 text-sm tabular-nums">{n(p.cpus_used)} of {n(p.cpus_total)} CPUs
            <span className="text-dim"> · {pct(p.cpus_used, p.cpus_total)}</span>
            {p.gpus_total > 0 && <span className="text-dim"> · GPUs {p.gpus_used} of {p.gpus_total}</span>}</p>
          <p className="mt-0.5 text-sm tabular-nums">{n(p.running)} running ·{' '}
            <span className={p.pending > p.running ? 'font-semibold text-warn' : ''}>{n(p.pending)} waiting</span></p>
        </Card>
      ))}
      {!parts.length && <p className="text-dim">No partitions to show.</p>}
    </div>
  )
}
