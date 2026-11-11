import type { ReactNode } from 'react'

import type { Guide, GuideQueue } from '../../types/usage'
import { human } from '../clusters/time'
import { n } from './format'
import { capsText, costText, factorText } from './limitsText'
import { Section } from './Section'

const HEAD = 'px-2 font-semibold'

function Cell({ value, sub }: { value: ReactNode; sub?: string }) {
  return (
    <td className="px-2 py-2.5 align-top">
      <div>{value}</div>
      {sub && <div className="text-sm text-dim">{sub}</div>}
    </td>
  )
}

const size = (v: number | null, none = 'Not listed') => (v === null ? none : n(v))

function about(q: GuideQueue): string {
  return [q.nodes !== null ? `${n(q.nodes)} node${q.nodes === 1 ? '' : 's'}` : '', q.whole_nodes ? 'whole nodes only' : '',
    q.can_be_stopped ? 'other jobs can stop yours' : ''].filter(Boolean).join(' · ')
}

function QueueRow({ q, gpus }: { q: GuideQueue; gpus: boolean }) {
  const cost = costText(q.billing, q.whole_nodes, q.gpus.length > 0)
  const perNode = q.max_nodes !== 1 && q.cores_per_node ? `${n(q.cores_per_node)} on each node` : ''
  const perCore = q.mem_per_core_gb ? `At most ${q.mem_per_core_gb} GB per core`
    : q.default_mem_per_core_gb ? `${q.default_mem_per_core_gb} GB per core unless you ask` : ''
  return (
    <tr className="border-b border-line last:border-0">
      <td className="py-2.5 pr-2 pl-4 align-top normal-nums">
        <div className={q.up ? '' : 'text-dim'}>{q.name}{!q.up && ' (down)'}
          {q.default && <span className="text-sm text-dim"> default</span>}</div>
        <div className="w-[150px] text-sm text-dim">{about(q)}</div>
      </td>
      <Cell value={q.longest === null ? 'No limit' : human(q.longest)}
        sub={q.default_time ? `${human(q.default_time)} unless you ask` : ''} />
      <Cell value={size(q.max_nodes)} />
      <Cell value={size(q.cores)} sub={perNode} />
      <Cell value={q.memory_gb === null ? 'Not listed' : `${n(q.memory_gb)} GB`} sub={perCore} />
      {gpus && <Cell value={q.gpus.length ? q.gpus.map((g) => `${n(g.count)} × ${g.type || 'GPU'}`).join(', ')
        : <span className="text-dim">none</span>} />}
      <td className="w-[190px] py-2.5 pr-4 pl-2 align-top">
        <div>{cost.value}</div>
        {cost.sub && <div className="text-sm text-dim">{cost.sub}</div>}
      </td>
    </tr>
  )
}

/** Per queue, the most one job may ask for and what it costs; then the same for each priority. Read from Slurm. */
export function LimitsTab({ guide, error }: { guide: Guide | null; error: string }) {
  const note = error ? `Could not read the limits: ${error}` : !guide ? 'Reading from Slurm…'
    : !guide.known ? 'Slurm did not say what this cluster allows.'
      : `The most one job can ask for on each queue you can use, read from Slurm just now.${guide.others
        ? ` ${n(guide.others)} other ${guide.others === 1 ? 'queue needs' : 'queues need'} a group or priority you don't have.` : ''}`
  const gpus = (guide?.queues ?? []).some((q) => q.gpus.length)
  return (
    <>
      <Section note={note}>
        {!!guide?.queues.length && (
          <div className="overflow-x-auto border-y border-line">
            <table className="w-full border-collapse text-base tabular-nums">
              <thead>
                <tr className="border-b border-line text-left text-xs whitespace-nowrap text-dim">
                  <th className="py-2.5 pr-2 pl-4 font-semibold">Queue</th>
                  <th className={HEAD}>Longest time</th>
                  <th className={HEAD}>Nodes</th>
                  <th className={HEAD}>Cores</th>
                  <th className={HEAD}>Memory per node</th>
                  {gpus && <th className={HEAD}>GPUs per node</th>}
                  <th className="pr-4 pl-2 font-semibold">Cost an hour</th>
                </tr>
              </thead>
              <tbody>{guide.queues.map((q) => <QueueRow key={q.name} q={q} gpus={gpus} />)}</tbody>
            </table>
          </div>
        )}
      </Section>
      {!!guide?.qos.length && (
        <Section title="Priorities" note="Each job runs under one priority. It can set a shorter time or a lower cap than its queue.">
          <div className="overflow-x-auto border-y border-line">
            <table className="w-full border-collapse text-base tabular-nums">
              <thead>
                <tr className="border-b border-line text-left text-xs whitespace-nowrap text-dim">
                  <th className="py-2.5 pr-2 pl-4 font-semibold">Priority</th>
                  <th className={HEAD}>Longest time</th>
                  <th className={HEAD}>One job</th>
                  <th className={HEAD}>All your jobs together</th>
                  <th className="pr-4 pl-2 font-semibold">SUs</th>
                </tr>
              </thead>
              <tbody>
                {guide.qos.map((q) => (
                  <tr key={q.name} className="border-b border-line last:border-0">
                    <td className="py-2.5 pr-2 pl-4 align-top normal-nums">
                      <div>{q.name}</div>
                      <div className="text-sm text-dim">{q.queues.join(', ')}</div>
                    </td>
                    <Cell value={q.longest === null ? 'No limit' : human(q.longest)} />
                    <Cell value={capsText(q.per_job) || <span className="text-dim">No limit</span>} />
                    <Cell value={capsText(q.per_user) || <span className="text-dim">No limit</span>} />
                    <td className="py-2.5 pr-4 pl-2 align-top">{factorText(q.factor)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>
      )}
    </>
  )
}
