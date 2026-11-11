// Limits: the desktop's two tables as blocks that fit a phone: per queue, the most one job may ask for and what it
// costs; then the same for each priority. The words come from the desktop's limitsText.
import type { ReactNode } from 'react'

import { human } from '@shared/components/clusters/time'
import { n } from '@shared/components/usage/format'
import { capsText, costText, factorText } from '@shared/components/usage/limitsText'
import { Section } from '@shared/components/usage/Section'
import { List } from '@shared/components/ui/List'
import type { Guide, GuideQueue } from '@shared/types/usage'

const size = (v: number | null) => (v === null ? 'Not listed' : n(v))

function Fact({ label, value, sub }: { label: string; value: ReactNode; sub?: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-dim">{label}</dt>
      <dd className="tabular-nums">{value}</dd>
      {sub && <dd className="text-sm text-dim">{sub}</dd>}
    </div>
  )
}

function about(q: GuideQueue): string {
  return [q.nodes !== null ? `${n(q.nodes)} node${q.nodes === 1 ? '' : 's'}` : '', q.whole_nodes ? 'whole nodes only' : '',
    q.can_be_stopped ? 'other jobs can stop yours' : ''].filter(Boolean).join(' · ')
}

function Queue({ q, gpus }: { q: GuideQueue; gpus: boolean }) {
  const cost = costText(q.billing, q.whole_nodes, q.gpus.length > 0)
  const perNode = q.max_nodes !== 1 && q.cores_per_node ? `${n(q.cores_per_node)} on each node` : ''
  const perCore = q.mem_per_core_gb ? `At most ${q.mem_per_core_gb} GB per core`
    : q.default_mem_per_core_gb ? `${q.default_mem_per_core_gb} GB per core unless you ask` : ''
  return (
    <div className="px-4 py-3">
      <div className={q.up ? '' : 'text-dim'}>{q.name}{!q.up && ' (down)'}
        {q.default && <span className="text-sm text-dim"> default</span>}</div>
      <div className="text-sm text-dim">{about(q)}</div>
      <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-2">
        <Fact label="Longest time" value={q.longest === null ? 'No limit' : human(q.longest)}
          sub={q.default_time ? `${human(q.default_time)} unless you ask` : ''} />
        <Fact label="Nodes" value={size(q.max_nodes)} />
        <Fact label="Cores" value={size(q.cores)} sub={perNode} />
        <Fact label="Memory per node" value={q.memory_gb === null ? 'Not listed' : `${n(q.memory_gb)} GB`} sub={perCore} />
        {gpus && <Fact label="GPUs per node" value={q.gpus.length
          ? q.gpus.map((g) => `${n(g.count)} × ${g.type || 'GPU'}`).join(', ') : <span className="text-dim">none</span>} />}
        <Fact label="Cost an hour" value={cost.value} sub={cost.sub} />
      </dl>
    </div>
  )
}

export function LimitsList({ guide, error }: { guide: Guide | null; error: string }) {
  const note = error ? `Could not read the limits: ${error}` : !guide ? 'Reading from Slurm…'
    : !guide.known ? 'Slurm did not say what this cluster allows.'
      : `The most one job can ask for on each queue you can use, read from Slurm just now.${guide.others
        ? ` ${n(guide.others)} other ${guide.others === 1 ? 'queue needs' : 'queues need'} a group or priority you don't have.` : ''}`
  const gpus = (guide?.queues ?? []).some((q) => q.gpus.length)
  const none = <span className="text-dim">No limit</span>
  return (
    <>
      <Section note={note}>
        {!!guide?.queues.length && <List>{guide.queues.map((q) => <Queue key={q.name} q={q} gpus={gpus} />)}</List>}
      </Section>
      {!!guide?.qos.length && (
        <Section title="Priorities" note="Each job runs under one priority. It can set a shorter time or a lower cap than its queue.">
          <List>
            {guide.qos.map((q) => (
              <div key={q.name} className="px-4 py-3">
                <div>{q.name}</div>
                <div className="text-sm text-dim">{q.queues.join(', ')}</div>
                <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-2">
                  <Fact label="Longest time" value={q.longest === null ? 'No limit' : human(q.longest)} />
                  <Fact label="SUs" value={factorText(q.factor)} />
                  <Fact label="One job" value={capsText(q.per_job) || none} />
                  <Fact label="All your jobs together" value={capsText(q.per_user) || none} />
                </dl>
              </div>
            ))}
          </List>
        </Section>
      )}
    </>
  )
}
