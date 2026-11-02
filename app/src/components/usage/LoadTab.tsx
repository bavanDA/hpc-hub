// Load: how busy each partition is, CPUs and GPUs in use, jobs running and waiting.
import type { Partition } from '../../types/usage'
import { Card } from '../ui'
import { n, pct } from './format'
import { Bar, Section } from './parts'

export function LoadTab({ parts, error }: { name?: string; parts: Partition[] | null; error: string }) {
  const busy = (parts ?? []).reduce((s, p) => s + p.cpus_used, 0)
  const total = (parts ?? []).reduce((s, p) => s + p.cpus_total, 0)
  const gpus = (parts ?? []).some((p) => p.gpus_total)
  const note = error ? `Could not load: ${error}` : !parts ? 'Loading…'
    : `${n(busy)} of ${n(total)} CPUs busy (${pct(busy, total)}). Many jobs waiting means a long queue.`
  return (
    <Section title="Queues" note={note}>
      {parts && parts.length > 0 && (
        <Card className="overflow-x-auto">
          <table className="w-full border-collapse text-base tabular-nums">
            <thead>
              <tr className="border-b border-line text-left text-sm whitespace-nowrap text-dim">
                <th className="py-2.5 pr-2 pl-4 font-semibold">Queue</th>
                <th className="px-2 font-semibold">CPUs busy</th>
                {gpus && <th className="px-2 text-right font-semibold">GPUs</th>}
                <th className="px-2 text-right font-semibold">Running</th>
                <th className="pr-4 pl-2 text-right font-semibold">Waiting</th>
              </tr>
            </thead>
            <tbody>
              {parts.map((p) => (
                <tr key={p.name} className="h-14 border-b border-line last:border-0">
                  <td className="pr-2 pl-4 whitespace-nowrap">
                    <div className={p.up ? '' : 'text-dim'}>{p.name}{!p.up && ' (down)'}</div>
                    <div className="text-sm text-dim">{n(p.nodes)} nodes</div>
                  </td>
                  <td className="w-full px-2">
                    <div className="flex items-center gap-3">
                      <Bar value={p.cpus_total ? p.cpus_used / p.cpus_total : 0} className="w-full max-w-60" />
                      <span className="whitespace-nowrap">{n(p.cpus_used)} of {n(p.cpus_total)}
                        <span className="text-dim"> · {pct(p.cpus_used, p.cpus_total)}</span></span>
                    </div>
                  </td>
                  {gpus && <td className="px-2 text-right whitespace-nowrap">
                    {p.gpus_total ? `${p.gpus_used} of ${p.gpus_total}` : <span className="text-dim">none</span>}</td>}
                  <td className="px-2 text-right">{n(p.running)}</td>
                  <td className={`pr-4 pl-2 text-right ${p.pending > p.running ? 'font-semibold text-warn' : ''}`}>
                    {n(p.pending)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </Section>
  )
}
