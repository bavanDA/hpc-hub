// The queues a node request tries, cheapest first: one row per queue with its billing, instead of the raw
// "general:low,general:standard" text the config keeps (ClusterConfig.queues).
import { Plus, X } from 'lucide-react'
import { useEffect, useId, useState } from 'react'

import { call } from '../../rpc'
import type { Limits } from '../../types/clusters'
import { IconButton } from '../ui'

type Queue = { queue: string; billing: string }

export const parseQueues = (text: string): Queue[] => text.split(',').map((s) => s.trim()).filter(Boolean)
  .map((s) => { const [queue = '', billing = ''] = s.split(':'); return { queue: queue.trim(), billing: billing.trim() } })

export const queuesText = (list: Queue[]) => list.filter((q) => q.queue.trim())
  .map((q) => (q.billing.trim() ? `${q.queue.trim()}:${q.billing.trim()}` : q.queue.trim())).join(',')

export function QueueRows({ cluster, value, onChange }:
  { cluster: string; value: string; onChange: (text: string) => void }) {
  const [rows, setRows] = useState<Queue[]>(() => parseQueues(value))
  const [limits, setLimits] = useState<Limits | null>(null)
  const queueList = useId(), billingList = useId()
  useEffect(() => { call<Limits>('clusters.partitions', { cluster }).then(setLimits).catch(() => {}) }, [cluster])

  const set = (next: Queue[]) => { setRows(next); onChange(queuesText(next)) }
  const edit = (i: number, part: Partial<Queue>) => set(rows.map((q, j) => (j === i ? { ...q, ...part } : q)))
  const box = 'h-9 min-w-0 flex-1 rounded-md bg-pill px-2.5 text-base outline-none focus:shadow-[0_0_0_2px_var(--color-focus)]'

  return (
    <div>
      <datalist id={queueList}>{limits?.partitions.map((p) => <option key={p} value={p} />)}</datalist>
      <datalist id={billingList}>{limits?.qos.map((p) => <option key={p} value={p} />)}</datalist>
      {rows.length > 0 && (
        <div className="flex items-center gap-2 border-b border-line px-4 py-1.5 text-sm font-semibold text-dim">
          <span className="w-5" /><span className="flex-1">Queue</span><span className="flex-1">Billing</span>
          <span className="w-9" />
        </div>
      )}
      {rows.map((q, i) => (
        <div key={i} className="flex min-h-[56px] items-center gap-2 border-b border-line px-4">
          <span className="w-5 text-sm text-dim tabular-nums">{i + 1}</span>
          <input aria-label={`Queue ${i + 1}`} placeholder="Queue" value={q.queue} list={queueList} spellCheck={false}
            onChange={(e) => edit(i, { queue: e.target.value })} className={box} />
          <input aria-label={`Billing ${i + 1}`} placeholder="Billing" value={q.billing} list={billingList}
            spellCheck={false} onChange={(e) => edit(i, { billing: e.target.value })} className={box} />
          <IconButton icon={X} label={`Remove queue ${i + 1}`} onClick={() => set(rows.filter((_, j) => j !== i))} />
        </div>
      ))}
      <button type="button" onClick={() => setRows([...rows, { queue: '', billing: '' }])}
        className="flex h-[52px] w-full items-center gap-2 px-4 font-semibold hover:bg-hover">
        <Plus size={18} className="text-dim" /> Add a queue</button>
    </div>
  )
}
