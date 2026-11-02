// Queues: how busy each one is, a row each: cores in use as a bar, GPUs, jobs running and waiting.
import { n, pct } from '@shared/components/usage/format'
import type { Partition } from '@shared/types/usage'
import { List } from '../../ui'
import { Bar } from './Bar'

export function LoadView({ name, parts }: { name: string; parts: Partition[] }) {
  const busy = parts.reduce((s, p) => s + p.cpus_used, 0)
  const total = parts.reduce((s, p) => s + p.cpus_total, 0)
  return (
    <>
      <p className="px-4 pb-3 text-dim tabular-nums">{name}: {n(busy)} of {n(total)} cores busy ({pct(busy, total)}).</p>
      <List>
        {parts.map((p) => (
          <div key={p.name} className="flex min-h-14 flex-col gap-1 border-b border-line px-4 py-2.5">
            <span className="flex items-baseline gap-3">
              <span className={`min-w-0 flex-1 break-words ${p.up ? '' : 'text-dim'}`}>{p.name}{!p.up && ' (down)'}</span>
              <span className="font-medium tabular-nums">{pct(p.cpus_used, p.cpus_total)}</span>
            </span>
            <Bar value={p.cpus_total ? p.cpus_used / p.cpus_total : 0} label={p.name} className="my-1" />
            <span className="text-sm break-words text-dim tabular-nums">
              {[`${n(p.cpus_used)} of ${n(p.cpus_total)} cores`,
                p.gpus_total > 0 ? `${p.gpus_used} of ${p.gpus_total} GPUs` : '',
                `${n(p.running)} running`, `${n(p.pending)} waiting`].filter(Boolean).join(' · ')}</span>
          </div>
        ))}
        {!parts.length && <p className="border-b border-line px-4 py-3 text-dim">No queues to show.</p>}
      </List>
    </>
  )
}
