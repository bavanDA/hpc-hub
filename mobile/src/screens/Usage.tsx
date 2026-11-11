// Usage: the desktop page on a phone (app/src/pages/Usage.tsx). All clusters shows the allocation and storage cards in
// one column; a cluster picked in the header has the Overview, Hours, Storage, Queues and Limits tabs.
import { CircleAlert, RefreshCw } from 'lucide-react'
import { useEffect, useState } from 'react'

import { useActiveCluster } from '@shared/components/clusters/active'
import { useAllClusters, useOfferAllClusters } from '@shared/components/clusters/allClusters'
import { ClusterPicker } from '@shared/components/clusters/ClusterPicker'
import { NotConnected } from '@shared/components/clusters/NotConnected'
import { EmptyState } from '@shared/components/ui/EmptyState'
import { Spinner } from '@shared/components/ui/Spinner'
import { Overview } from '@shared/components/usage/Overview'
import { StorageTab } from '@shared/components/usage/StorageTab'
import { busiest } from '@shared/components/usage/summary'
import { SuTab } from '@shared/components/usage/SuTab'
import { useRemote } from '@shared/components/usage/useRemote'
import type { View } from '@shared/components/usage/view'
import { useGo, usePageParams } from '@shared/nav'
import type { Account, Guide, Partition, People, Storage } from '@shared/types/usage'
import { Choice } from '../parts/Choice'
import { Header } from '../parts/Header'
import { NoClusters } from '../parts/NoClusters'
import { LimitsList } from '../parts/usage/LimitsList'
import { QueueList } from '../parts/usage/QueueList'
import { IconBtn, Segments } from '../ui'

const PERIODS = [['7', 'Last 7 days'], ['30', 'Last 30 days'], ['90', 'Last 90 days'], ['365', 'Last year']] as const
const TABS = [['overview', 'Overview'], ['su', 'Hours'], ['storage', 'Storage'], ['load', 'Queues'],
  ['limits', 'Limits']] as const
// the desktop's tabs, fitted to a phone: the people's bars go (the SU and percent say it), the quota bars shrink, and
// the dotted line under SU goes because it only explains itself on hover
const PEOPLE = '[&_.w-40]:hidden [&_.cursor-help]:no-underline'
const QUOTAS = '[&_.w-40]:w-20 [&_.truncate]:whitespace-normal'
// the overview's header: its words on their own line, then the Sort select taking the room there is
const OVERVIEW = '[&_h2+span]:basis-full [&_h2+span+span]:hidden [&_.relative:has(select)]:min-w-0 ' +
  '[&_.relative:has(select)]:flex-1 ' +
  '[&_select]:w-full'

export function Usage() {
  const { clusters, sessions, cluster, session, connected, error: clustersError, setCluster } = useActiveCluster()
  useOfferAllClusters()
  const { all, setAll } = useAllClusters()
  const params = usePageParams()
  const go = useGo()
  const [tab, setTab] = useState<View>('overview')
  const [days, setDays] = useState<string>('30')
  const [pick, setPick] = useState('')
  const [tick, setTick] = useState(0)
  useEffect(() => { if (params.cluster) setAll(false) }, [params.cluster, setAll])  // opened for one cluster
  const id = !all && connected && cluster ? cluster.id : ''
  const single = !all && tab !== 'overview'

  const accounts = useRemote<Account[]>('usage.accounts', id && single ? { cluster: id } : null, tick)
  const list = accounts.data ?? []
  const account = list.find((a) => a.account === pick) ?? busiest(list)
  const name = account?.account ?? ''
  const ready = id && single && accounts.data
  const people = useRemote<People>('usage.people',
    ready && name ? { cluster: id, account: name, days: Number(days) } : null, tick)
  const storage = useRemote<Storage>('usage.storage', ready ? { cluster: id, account: name } : null, tick)
  const load = useRemote<Partition[]>('usage.load', id && single ? { cluster: id } : null, tick)
  const guide = useRemote<Guide>('clusters.limits', id && single && tab === 'limits' ? { cluster: id } : null, tick)
  const noAccounts = tab === 'load' || tab === 'limits'  // what these show doesn't depend on the group

  const open = (to: string, view: View, group?: string) => {
    setAll(false)
    setCluster(to)
    setTab(view)
    if (group) setPick(group)
  }

  let page
  if (clusters && !clusters.length) page = <NoClusters />
  else if (clustersError) page = <EmptyState icon={CircleAlert} title="Could not load clusters" text={clustersError} report />
  else if (!clusters || !cluster) page = <div className="grid h-full place-items-center"><Spinner size={24} /></div>
  else if (all) {
    page = <div className={`h-full overflow-y-auto ${OVERVIEW}`}>
      <Overview clusters={clusters} sessions={sessions} onOpen={open} inset /></div>
  } else {
    const loading = accounts.loading || people.loading || storage.loading || load.loading || guide.loading
    let body
    if (!connected) body = <NotConnected cluster={cluster} session={session} what="usage" />
    else if (tab === 'overview') {
      body = <div className={OVERVIEW}><Overview clusters={[cluster]} sessions={sessions} onOpen={open} inset /></div>
    } else if (!noAccounts && accounts.error) {
      body = <EmptyState icon={CircleAlert} title="Could not read accounts" text={accounts.error} report />
    } else if (!noAccounts && !accounts.data) body = <div className="grid h-full place-items-center"><Spinner size={24} /></div>
    else body = (
      <div className={`flex flex-col gap-6 px-4 pt-2 pb-6 ${tab === 'su' ? PEOPLE : QUOTAS}`}>
        {tab === 'su' && <SuTab account={account} people={people.data} error={people.error} loading={people.loading}
          period={PERIODS.find(([d]) => d === days)![1]}
          onPerson={(user) => go('jobs', { cluster: cluster.id, user })} />}
        {tab === 'storage' && <StorageTab storage={storage.data} error={storage.error}
          onBackup={() => go('backup', { cluster: cluster.id })} />}
        {tab === 'load' && <QueueList parts={load.data} error={load.error} />}
        {tab === 'limits' && <LimitsList guide={guide.data} error={guide.error} />}
      </div>
    )
    page = (
      <div className="flex h-full flex-col">
        {connected && <div className="flex shrink-0 flex-col gap-2 px-4 pt-3 pb-2">
          <div className="[&_button]:px-0.5 [&_button]:whitespace-nowrap">
            <Segments label="Show" value={tab} onChange={setTab} options={TABS} /></div>
          {single && <div className="flex items-center gap-2">
            {!noAccounts && list.length > 0 && <Choice label="Group to bill" value={name} onPick={setPick}
              options={list.map((a) => [a.account, a.account] as const)} className="min-w-0 shrink" />}
            {tab === 'su' && <Choice label="Period" value={days} onPick={setDays} options={PERIODS}
              className="min-w-0 flex-1" />}
            <span className="ml-auto">{loading && (accounts.data || noAccounts)
              ? <span className="grid size-10 place-items-center"><Spinner /></span>
              : <IconBtn icon={RefreshCw} label="Refresh" onClick={() => setTick(tick + 1)} />}</span>
          </div>}
        </div>}
        <div className="min-h-0 flex-1 overflow-y-auto">{body}</div>
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col">
      <Header title="Usage" chip={<ClusterPicker />} />
      <div className="min-h-0 flex-1">{page}</div>
    </div>
  )
}
