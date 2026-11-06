import { CircleAlert, RefreshCw } from 'lucide-react'
import { useState } from 'react'

import type { Cluster, Session } from '../../types'
import type { Allocations, Partition, Storage } from '../../types/usage'
import { NotConnected } from '../clusters/NotConnected'
import { Select } from '../jobs/Select'
import { IconButton } from '../ui/IconButton'
import { Spinner } from '../ui/Spinner'
import { AllocationCard } from './AllocationCard'
import { NoteCard } from './NoteCard'
import { timeLeft } from './pace'
import { Queues } from './Queues'
import { StorageCard } from './StorageCard'
import { busiest, fullName } from './summary'
import { useEach } from './useEach'
import type { OpenView } from './view'

const SORTS = [['time', 'Sort: least time left'], ['cluster', 'Sort: by cluster']] as const

export function Overview({ clusters, sessions, onOpen, inset }:
  { clusters: Cluster[]; sessions: Record<string, Session>; onOpen: OpenView; inset?: boolean }) {
  const [sort, setSort] = useState<'time' | 'cluster'>('time')
  const [tick, setTick] = useState(0)
  const on = clusters.filter((c) => sessions[c.id]?.connected)
  const ids = Object.fromEntries(on.map((c) => [c.id, { cluster: c.id }]))
  const groups = useEach<Allocations>('usage.allocations', ids, tick, true)
  const load = useEach<Partition[]>('usage.load', ids, tick)
  // storage asks with the busiest group (Expanse reads the group's quota), so it waits for the groups
  const storageIds = Object.fromEntries(on.flatMap((c) => {
    const g = groups(c.id)
    if (!g.data && !g.error) return []
    return [[c.id, { cluster: c.id, account: busiest(g.data?.groups ?? [])?.account ?? '' }]]
  }))
  const storage = useEach<Storage>('usage.storage', storageIds, tick)

  type Item = { key: string; order: number; at: number; node: React.ReactNode; quiet?: boolean }
  const items: Item[] = []
  let count = 0
  const withData = new Set<string>()
  clusters.forEach((c, at) => {
    const s = sessions[c.id]
    if (!s?.connected) {
      items.push({ key: c.id, order: 2e9, at, quiet: true,
        node: <NotConnected compact cluster={c} session={s} what="usage" /> })
      return
    }
    const g = groups(c.id)
    if (g.data) {
      if (!g.data.groups.length) {
        items.push({ key: c.id, order: 1.5e9, at, node: <NoteCard c={c} s={s} title="No groups to bill"
          text={`Your account on ${fullName(c)} is not in a group with SUs.`} /> })
      }
      for (const a of g.data.groups) {
        count++
        withData.add(c.id)
        items.push({ key: `${c.id}/${a.account}`, order: timeLeft(a), at,
          node: <AllocationCard a={a} c={c} s={s} me={g.data.me} onOpen={onOpen} /> })
      }
    } else if (g.error) {
      items.push({ key: c.id, order: 1.5e9, at, node: <NoteCard c={c} s={s} title="Could not read groups" text={g.error} /> })
    } else {
      items.push({ key: c.id, order: 1.9e9, at, node: <NoteCard c={c} s={s} title="Reading groups" busy /> })
    }
  })
  items.sort((a, b) => (sort === 'cluster' ? a.at - b.at || a.order - b.order : a.order - b.order || a.at - b.at))
  const busy = on.some((c) => groups(c.id).loading || load(c.id).loading || storage(c.id).loading)

  return (
    <div className={`flex flex-col pb-8 ${inset ? 'px-4 pt-3' : 'px-7 pt-[22px]'}`}>
      <div className="mb-[18px] flex flex-wrap items-center gap-x-3 gap-y-2">
        <h2 className="text-xl font-semibold">Allocations</h2>
        <span className="text-sm text-dim">
          {count ? `${count} group${count === 1 ? '' : 's'} on ${withData.size} cluster${withData.size === 1 ? '' : 's'}`
            + ' · darker part of each bar is you' : on.length ? '' : 'No cluster is connected'}</span>
        <span className="flex-1" />
        <Select label="Sort" value={sort} onChange={setSort} options={SORTS} />
        {busy && tick ? <span className="grid size-9 shrink-0 place-items-center"><Spinner /></span>
          : <IconButton icon={RefreshCw} label="Refresh" onClick={() => setTick(tick + 1)} disabled={!on.length} />}
      </div>
      <div className="grid grid-cols-[repeat(auto-fill,minmax(250px,1fr))] gap-4">
        {items.map((it) => <div key={it.key} className={it.quiet ? 'self-start' : 'flex flex-col [&>*]:flex-1'}>
          {it.node}</div>)}
      </div>
      {on.length > 0 && <>
        <div className="mt-[26px] mb-3 flex flex-wrap items-baseline gap-x-6 gap-y-1">
          <h2 className="text-xl font-semibold">Storage</h2>
          <span className="flex-1" />
          <Queues shown={on} load={load} onOpen={onOpen} />
        </div>
        <div className="grid grid-cols-[repeat(auto-fill,minmax(300px,1fr))] items-start gap-4">
          {on.map((c) => <StorageCard key={c.id} c={c} s={sessions[c.id]} got={storage(c.id)} onOpen={onOpen} />)}
        </div>
      </>}
      {!clusters.length && <p className="flex items-center gap-2 text-dim"><CircleAlert size={16} />No clusters set up.</p>}
    </div>
  )
}
