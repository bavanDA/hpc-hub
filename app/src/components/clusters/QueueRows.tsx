// The queues a node request tries, cheapest first: one row per queue with its billing, instead of the raw
// "general:low,general:standard" text the config keeps (ClusterConfig.queues). Click one to change or remove it.
import { Plus } from 'lucide-react'
import { useEffect, useState } from 'react'

import { call } from '../../rpc'
import type { Limits } from '../../types/clusters'
import { EDialog, Field, List, MainButton, Row } from '../e/ui'

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

  const start = (i: number) => { setDraft(rows[i] ?? { queue: '', billing: '' }); setEdit(i) }
  const put = (q: Queue | null) => {
    const next = [...rows]
    if (q) next[edit!] = q; else next.splice(edit!, 1)
    onChange(queuesText(next))
    setEdit(null)
  }
  const list = (id: string, xs?: string[]) => xs?.length
    ? <datalist id={id}>{xs.map((x) => <option key={x} value={x} />)}</datalist> : null
  return (
    <>
      <List>
        {rows.map((q, i) => <Row key={`${q.queue}:${q.billing}:${i}`} label={q.queue} opens onPress={() => start(i)}
          value={q.billing ? `Billing: ${q.billing}` : 'Default billing'} />)}
        <Row icon={Plus} label="Add a queue" onPress={() => start(rows.length)} />
      </List>
      {edit !== null && <EDialog title={edit < rows.length ? rows[edit].queue : 'Add a queue'} width={440}
        onClose={() => setEdit(null)} actions={<MainButton disabled={!draft.queue.trim()}
          onClick={() => put(draft)}>Done</MainButton>}>
        <div className="px-5 pt-1">
          <Field label="Queue" list="e-queue-rows" value={draft.queue} autoFocus
            placeholder={limits?.default_partition || ''} onChange={(e) => setDraft({ ...draft, queue: e.target.value })} />
          <Field label="Billing" list="e-billing-rows" value={draft.billing} placeholder="Default"
            onChange={(e) => setDraft({ ...draft, billing: e.target.value })} />
          {list('e-queue-rows', limits?.partitions)}{list('e-billing-rows', limits?.qos)}
        </div>
        {edit < rows.length && <div className="pt-5"><List>
          <Row label="Remove this queue" danger onPress={() => put(null)} /></List></div>}
      </EDialog>}
    </>
  )
}
