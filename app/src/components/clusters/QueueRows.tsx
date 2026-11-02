// The queues a node request tries, cheapest first: one row per queue and priority, instead of the raw
// "general:low,general:standard" text the config keeps (ClusterConfig.queues). Click one to change or remove it.
import { Plus } from 'lucide-react'
import { useEffect, useState } from 'react'

import { call } from '../../rpc'
import type { Limits } from '../../types/clusters'
import { EDialog, List, MainButton, Row } from '../e/ui'
import { queueRowName } from './priority'
import { QueuePickers } from './queues'

type Queue = { queue: string; billing: string }

export const parseQueues = (text: string): Queue[] => text.split(',').map((s) => s.trim()).filter(Boolean)
  .map((s) => { const [queue = '', billing = ''] = s.split(':'); return { queue: queue.trim(), billing: billing.trim() } })

export const queuesText = (list: Queue[]) => list.filter((q) => q.queue.trim())
  .map((q) => (q.billing.trim() ? `${q.queue.trim()}:${q.billing.trim()}` : q.queue.trim())).join(',')

/** "3 queues" for "general:low, debug:debug, general:standard". */
export function queueCount(text?: string) {
  const n = parseQueues(text ?? '').length
  return n === 0 ? 'The one you pick' : n === 1 ? '1 queue' : `${n} queues`
}

export function QueueRows({ cluster, value, onChange }:
  { cluster: string; value: string; onChange: (text: string) => void }) {
  const rows = parseQueues(value)
  const [edit, setEdit] = useState<number | null>(null)  // rows.length: a new one
  const [draft, setDraft] = useState<Queue>({ queue: '', billing: '' })
  const [limits, setLimits] = useState<Limits | null>(null)
  useEffect(() => { call<Limits>('clusters.partitions', { cluster }).then(setLimits).catch(() => {}) }, [cluster])

  const start = (i: number) => { setDraft(rows[i] ?? { queue: limits?.default_partition ?? '', billing: '' }); setEdit(i) }
  const put = (q: Queue | null) => {
    const next = [...rows]
    if (q) next[edit!] = q; else next.splice(edit!, 1)
    onChange(queuesText(next))
    setEdit(null)
  }
  const label = (q: Queue) => queueRowName(q.queue, q.billing, limits?.default_partition)
  return (
    <>
      <List>
        {rows.map((q, i) => <Row key={`${q.queue}:${q.billing}:${i}`} label={label(q)} opens
          onPress={() => start(i)} />)}
        <Row icon={Plus} label="Add a queue" onPress={() => start(rows.length)} />
      </List>
      {edit !== null && <EDialog title={edit < rows.length ? label(rows[edit]) : 'Add a queue'} width={440}
        onClose={() => setEdit(null)} actions={<MainButton disabled={!draft.queue.trim()}
          onClick={() => put(draft)}>Done</MainButton>}>
        <QueuePickers limits={limits} queue={draft.queue} qos={draft.billing} autoFocus
          onQueue={(queue) => setDraft((d) => ({ ...d, queue }))} onQos={(billing) => setDraft((d) => ({ ...d, billing }))} />
        {edit < rows.length && <div className="pt-5"><List>
          <Row label="Remove this queue" danger onPress={() => put(null)} /></List></div>}
      </EDialog>}
    </>
  )
}
