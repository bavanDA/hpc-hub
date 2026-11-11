// Learn about queues on a phone: the desktop's two tables (usage/LimitsTab.tsx) as one block per queue and priority.
import { Fragment, type ReactNode } from 'react'

import { human } from '@shared/components/clusters/time'
import { n } from '@shared/components/usage/format'
import { capsText, costText, factorText } from '@shared/components/usage/limitsText'
import type { Guide, GuideQueue } from '@shared/types/usage'
import { Section } from '../../ui'

const size = (v: number | null) => (v === null ? 'Not listed' : n(v))
const long = (m: number | null) => (m === null ? 'No limit' : human(m))

function Block({ title, sub, facts }: { title: ReactNode; sub?: string; facts: [string, ReactNode, string?][] }) {
  return (
    <div className="border-b border-line px-5 py-2.5">
      <div className="font-semibold">{title}</div>
      {sub && <div className="text-sm text-dim">{sub}</div>}
      <dl className="mt-1.5 grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 tabular-nums">
        {facts.map(([label, value, hint]) => (
          <Fragment key={label}>
            <dt className="text-dim">{label}</dt>
            <dd className="min-w-0 text-right">{value}{hint && <div className="text-sm text-dim">{hint}</div>}</dd>
          </Fragment>
        ))}
      </dl>
    </div>
  )
}

function queueFacts(q: GuideQueue, gpus: boolean): [string, ReactNode, string?][] {
  const cost = costText(q.billing, q.whole_nodes, q.gpus.length > 0)
  return [
    ['Longest time', long(q.longest), q.default_time ? `${human(q.default_time)} unless you ask` : undefined],
    ['Nodes', size(q.max_nodes)],
    ['Cores', size(q.cores), q.max_nodes !== 1 && q.cores_per_node ? `${n(q.cores_per_node)} on each node` : undefined],
    ['Memory per node', q.memory_gb === null ? 'Not listed' : `${n(q.memory_gb)} GB`,
      q.mem_per_core_gb ? `At most ${q.mem_per_core_gb} GB per core`
        : q.default_mem_per_core_gb ? `${q.default_mem_per_core_gb} GB per core unless you ask` : undefined],
    ...(gpus ? [['GPUs per node', q.gpus.length ? q.gpus.map((g) => `${n(g.count)} × ${g.type || 'GPU'}`).join(', ')
      : <span className="text-dim">none</span>] as [string, ReactNode]] : []),
    ['Cost an hour', cost.value, cost.sub || undefined],
  ]
}

const about = (q: GuideQueue) => [q.nodes !== null ? `${n(q.nodes)} node${q.nodes === 1 ? '' : 's'}` : '',
  q.whole_nodes ? 'whole nodes only' : '', q.can_be_stopped ? 'other jobs can stop yours' : ''].filter(Boolean).join(' · ')

export function QueueGuide({ guide, error }: { guide: Guide | null; error: string }) {
  const note = error ? `Could not read the limits: ${error}` : !guide ? 'Reading from Slurm…'
    : !guide.known ? 'Slurm did not say what this cluster allows.'
      : `The most one job can ask for on each queue you can use, read from Slurm just now.${guide.others
        ? ` ${n(guide.others)} other ${guide.others === 1 ? 'queue needs' : 'queues need'} a group or priority you don't have.` : ''}`
  const gpus = (guide?.queues ?? []).some((q) => q.gpus.length)
  return (
    <>
      <p className="px-5 pb-1 text-sm text-dim">{note}</p>
      {!!guide?.queues.length && <Section>
        {guide.queues.map((q) => (
          <Block key={q.name} sub={about(q)} title={<span className={q.up ? '' : 'text-dim'}>{q.name}{!q.up && ' (down)'}
            {q.default && <span className="text-sm font-normal text-dim"> default</span>}</span>}
            facts={queueFacts(q, gpus)} />
        ))}
      </Section>}
      {!!guide?.qos.length && <Section title="Priorities"
        note="Each job runs under one priority. It can set a shorter time or a lower cap than its queue.">
        {guide.qos.map((q) => (
          <Block key={q.name} title={q.name} sub={q.queues.join(', ')} facts={[
            ['Longest time', long(q.longest)],
            ['One job', capsText(q.per_job) || <span className="text-dim">No limit</span>],
            ['All your jobs together', capsText(q.per_user) || <span className="text-dim">No limit</span>],
            ['SUs', factorText(q.factor)],
          ]} />
        ))}
      </Section>}
    </>
  )
}
