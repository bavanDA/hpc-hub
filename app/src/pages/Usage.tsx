// Usage: SU per person in your account, storage quotas and how busy the cluster is.
import { CircleAlert, RefreshCw } from 'lucide-react'
import { useState } from 'react'

import { NotConnected } from '../components/clusters/NotConnected'
import { Segments } from '../components/e/ui'
import { useClusters } from '../components/jobs/clusters'
import { Select } from '../components/jobs/Select'
import { EmptyState, IconButton, Spinner } from '../components/ui'
import { LoadTab } from '../components/usage/LoadTab'
import { StorageTab } from '../components/usage/StorageTab'
import { SuTab } from '../components/usage/SuTab'
import { useRemote } from '../components/usage/useRemote'
import { useGo } from '../nav'
import type { Account, Partition, People, Storage } from '../types/usage'

const PERIODS = [['7', 'Last 7 days'], ['30', 'Last 30 days'], ['90', 'Last 90 days'], ['365', 'Last year']] as const
type Tab = 'su' | 'storage' | 'load'
const TABS = [['su', 'Hours'], ['storage', 'Storage'], ['load', 'Queues']] as const

export function Usage() {
  const { clusters, cluster, session, connected, error: clustersError } = useClusters()
  const go = useGo()
  const [tab, setTab] = useState<Tab>('su')
  const [days, setDays] = useState<string>('30')
  const [pick, setPick] = useState('')
  const [tick, setTick] = useState(0)
  const id = connected && cluster ? cluster.id : ''

  const accounts = useRemote<Account[]>('usage.accounts', id ? { cluster: id } : null, tick)
  const list = accounts.data ?? []
  const busiest = list.reduce<Account | null>((a, b) => (!a || b.used > a.used ? b : a), null)
  const account = list.find((a) => a.account === pick) ?? busiest
  const name = account?.account ?? ''
  const ready = id && accounts.data
  const people = useRemote<People>('usage.people',
    ready && name ? { cluster: id, account: name, days: Number(days) } : null, tick)
  const storage = useRemote<Storage>('usage.storage', ready ? { cluster: id, account: name } : null, tick)
  const load = useRemote<Partition[]>('usage.load', id ? { cluster: id } : null, tick)

  if (clustersError) return <EmptyState icon={CircleAlert} title="Could not load clusters" text={clustersError} />
  if (!clusters || !cluster) return <div className="grid h-full place-items-center"><Spinner size={24} /></div>

  const off = !connected
  const loading = accounts.loading || people.loading || storage.loading || load.loading
  let body
  if (off) body = <NotConnected cluster={cluster} session={session} what="usage" />
  else if (accounts.error) {
    body = <EmptyState icon={CircleAlert} title="Could not read accounts" text={accounts.error} />
  }
  else if (!accounts.data) body = <div className="grid h-full place-items-center"><Spinner size={24} /></div>
  else body = (
    <div className="flex max-w-[900px] flex-col gap-6 px-4 pt-2 pb-6">
      {tab === 'su' && <SuTab account={account} people={people.data} error={people.error} loading={people.loading}
        period={PERIODS.find(([d]) => d === days)![1]}
        onPerson={(user) => go('jobs', { cluster: cluster.id, user })} />}
      {tab === 'storage' && <StorageTab storage={storage.data} error={storage.error}
        onBackup={() => go('backup', { cluster: cluster.id })} />}
      {tab === 'load' && <LoadTab name={cluster.name} parts={load.data} error={load.error} />}
    </div>
  )

  return (
    <div className="flex h-full flex-col">
      {!off && <div className="flex shrink-0 items-center gap-2 px-4 py-3">
        <div className="mr-2 w-[300px] shrink-0">
          <Segments label="Show" value={tab} onChange={setTab} options={TABS} /></div>
        {tab !== 'load' && <Select label="Group to bill" value={name} onChange={setPick} disabled={!list.length}
          options={list.length ? list.map((a) => [a.account, a.account] as const) : [['', '(no account)'] as const]} />}
        {tab === 'su' && <Select label="Period" value={days} onChange={setDays} options={PERIODS} />}
        <span className="flex-1" />
        {loading && accounts.data ? <span className="grid size-9 shrink-0 place-items-center"><Spinner /></span>
          : <IconButton icon={RefreshCw} label="Refresh" onClick={() => setTick(tick + 1)} disabled={!connected} />}
      </div>}
      <div className="min-h-0 flex-1 overflow-auto scheme-light-dark">{body}</div>
    </div>
  )
}
