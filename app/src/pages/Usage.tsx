// Usage: SU per person in your account, storage quotas and how busy the cluster is.
import { CircleAlert, Coins, Cpu, HardDrive, RefreshCw, WifiOff } from 'lucide-react'
import { useState } from 'react'

import { notConnected, useClusters } from '../components/jobs/clusters'
import { Select } from '../components/jobs/Select'
import { EmptyState, Spinner } from '../components/ui'
import { LoadTab } from '../components/usage/LoadTab'
import { StorageTab } from '../components/usage/StorageTab'
import { SuTab } from '../components/usage/SuTab'
import { useRemote } from '../components/usage/useRemote'
import type { Account, Partition, People, Storage } from '../types/usage'

const PERIODS = [['7', 'Last 7 days'], ['30', 'Last 30 days'], ['90', 'Last 90 days'], ['365', 'Last year']] as const
type Tab = 'su' | 'storage' | 'load'
const TABS = [['su', 'SU', Coins], ['storage', 'Storage', HardDrive], ['load', 'Load', Cpu]] as const

export function Usage() {
  const { clusters, cluster, session, connected, setCluster, error: clustersError } = useClusters()
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

  const off = !connected && notConnected(cluster.name, session, 'its usage')
  const loading = accounts.loading || people.loading || storage.loading || load.loading
  let body
  if (off) body = <EmptyState icon={WifiOff} title={off.title} text={off.text} />
  else if (accounts.error) {
    body = <EmptyState icon={CircleAlert} title="Could not read accounts" text={accounts.error} />
  }
  else if (!accounts.data) body = <div className="grid h-full place-items-center"><Spinner size={24} /></div>
  else body = (
    <div className="mx-auto flex max-w-[900px] flex-col gap-6 px-4 pt-3 pb-6">
      {tab === 'su' && <SuTab account={account} people={people.data} error={people.error} loading={people.loading}
        period={PERIODS.find(([d]) => d === days)![1]} />}
      {tab === 'storage' && <StorageTab storage={storage.data} error={storage.error} />}
      {tab === 'load' && <LoadTab name={cluster.name} parts={load.data} error={load.error} />}
    </div>
  )

  return (
    <div className="flex h-full flex-col">
      <div className="flex shrink-0 items-center gap-2 p-3">
        <Select label="Cluster" value={cluster.id} onChange={setCluster}
          options={clusters.map((c) => [c.id, c.name] as const)} />
        <Select label="Account" value={name} onChange={setPick} disabled={!list.length}
          options={list.length ? list.map((a) => [a.account, a.account] as const) : [['', '(no account)'] as const]} />
        <Select label="Period" value={days} onChange={setDays} options={PERIODS} />
        <div className="flex flex-1 justify-center">
          <div role="tablist" className="inline-flex rounded-lg bg-pill p-0.5">
            {TABS.map(([key, title, Icon]) => (
              <button key={key} role="tab" aria-selected={tab === key} onClick={() => setTab(key)}
                className={`flex h-8 items-center gap-2 rounded-md px-4 font-bold ${
                  tab === key ? 'bg-card shadow-[var(--shadow-card)]' : 'text-dim hover:text-text'}`}>
                <Icon size={16} />{title}
              </button>
            ))}
          </div>
        </div>
        <button aria-label="Refresh" title="Refresh" onClick={() => setTick(tick + 1)} disabled={!connected}
          className="grid size-9 shrink-0 place-items-center rounded-md bg-pill hover:bg-selected disabled:opacity-50">
          <RefreshCw size={16} className={loading && accounts.data ? 'animate-spin' : ''} />
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-auto scheme-light-dark">{body}</div>
    </div>
  )
}
