// More › Usage: hours (SU) left in a group and who used them, storage limits, and how busy each queue is, for the
// cluster picked anywhere in the app. Group and period are rows that open a picker; a person opens Jobs on their jobs.
import { CircleAlert, RefreshCw, WifiOff } from 'lucide-react'
import { useEffect, useState } from 'react'

import { shortName } from '@shared/components/clusters/loginCopy'
import { useRemote } from '@shared/components/usage/useRemote'
import { Spinner } from '@shared/components/ui'
import { useGo, usePageParams } from '@shared/nav'
import type { Account, Partition, People, Storage } from '@shared/types/usage'
import { usePhoneNav } from '../nav'
import { Header } from '../parts/Header'
import { LoadView } from '../parts/usage/LoadView'
import { StorageView } from '../parts/usage/StorageView'
import { SuView } from '../parts/usage/SuView'
import { useConnected } from '../parts/useConnected'
import { Button, EmptyState, PickerSheet, Row, Segments } from '../ui'

const PERIODS = [['7', 'Last 7 days'], ['30', 'Last 30 days'], ['90', 'Last 90 days'], ['365', 'Last year']] as const
type View = 'su' | 'storage' | 'load'
const VIEWS = [['su', 'Hours'], ['storage', 'Storage'], ['load', 'Queues']] as const

const Loading = () => <div className="grid h-40 place-items-center"><Spinner size={28} /></div>

export function Usage() {
  const { live, current, pick: pickCluster } = useConnected()
  const { open: openTab } = usePhoneNav()
  const go = useGo()
  const params = usePageParams()  // from Jobs: { cluster }
  const [view, setView] = useState<View>('su')
  const [days, setDays] = useState<string>('30')
  const [chosen, setChosen] = useState('')
  const [picking, setPicking] = useState<'' | 'account' | 'period'>('')
  const [tick, setTick] = useState(0)
  const id = current?.id ?? ''
  useEffect(() => { if (params.cluster) pickCluster(params.cluster) }, [params.cluster, pickCluster])

  const accounts = useRemote<Account[]>('usage.accounts', id ? { cluster: id } : null, tick)
  const list = accounts.data ?? []
  const busiest = list.reduce<Account | null>((a, b) => (!a || b.used > a.used ? b : a), null)
  const account = list.find((a) => a.account === chosen) ?? busiest
  const name = account?.account ?? ''
  const ready = !!id && !!accounts.data
  const people = useRemote<People>('usage.people',
    ready && name && view === 'su' ? { cluster: id, account: name, days: Number(days) } : null, tick)
  const storage = useRemote<Storage>('usage.storage', ready && view === 'storage' ? { cluster: id, account: name } : null,
    tick)
  const load = useRemote<Partition[]>('usage.load', id && view === 'load' ? { cluster: id } : null, tick)
  const busy = accounts.loading || people.loading || storage.loading || load.loading
  const period = PERIODS.find(([d]) => d === days)![1]

  const groupRow = !name ? null : list.length > 1
    ? <Row label="Group" value={name} opens onPress={() => setPicking('account')} />
    : <Row label="Group" value={name} />
  const periodRow = <Row label="Period" value={period} opens onPress={() => setPicking('period')} />

  let body
  if (view === 'load') {
    body = load.error ? <p className="px-4 py-3 text-bad">Couldn't load the queues: {load.error}</p>
      : load.data ? <LoadView name={current ? shortName(current) : ''} parts={load.data} /> : <Loading />
  } else if (accounts.error) body = <EmptyState icon={CircleAlert} title="Couldn't read your groups" text={accounts.error} />
  else if (!accounts.data) body = <Loading />
  else if (view === 'su') {
    body = account
      ? <SuView account={account} people={people.data} error={people.error} top={groupRow} periodRow={periodRow}
          onPerson={(user) => go('jobs', { cluster: id, user })} />
      : <EmptyState icon={CircleAlert} title="No group to bill" text="This cluster didn't list a group for you." />
  } else {
    body = storage.error ? <p className="px-4 py-3 text-bad">Couldn't load storage: {storage.error}</p>
      : storage.data ? <StorageView storage={storage.data} top={groupRow} /> : <Loading />
  }

  return (
    <div className="flex h-full flex-col">
      <Header title="Usage">
        {current && <button aria-label="Refresh" onClick={() => setTick(tick + 1)}
          className="grid size-12 place-items-center rounded-full active:bg-pressed">
          {busy && accounts.data ? <Spinner size={22} /> : <RefreshCw size={22} />}</button>}
      </Header>
      {!current
        ? <div className="flex flex-1 flex-col justify-center">
            <EmptyState icon={WifiOff} title="No cluster connected" text="Connect a cluster to see its hours, storage and queues."
              action={<Button kind="primary" onClick={() => openTab('clusters')}>Go to Clusters</Button>} />
          </div>
        : (
          <div className="min-h-0 flex-1 overflow-y-auto pb-6">
            <div className="flex flex-col gap-3 px-4 pb-4">
              {live.length > 1 && <Segments label="Cluster" value={current.id}
                options={live.map((c) => [c.id, shortName(c)] as const)} onChange={pickCluster} />}
              <Segments label="Show" value={view} options={VIEWS} onChange={setView} />
            </div>
            {body}
          </div>
        )}
      {picking === 'account' && <PickerSheet title="Group" value={name} onClose={() => setPicking('')}
        onPick={setChosen} options={list.map((a) => ({ value: a.account, label: a.account,
          hint: a.quota ? `${Math.max(0, Math.round(a.quota - a.used)).toLocaleString('en-US')} hours left (SU)`
            : undefined }))} />}
      {picking === 'period' && <PickerSheet title="Period" value={days} onClose={() => setPicking('')}
        onPick={setDays} options={PERIODS.map(([value, label]) => ({ value, label }))} />}
    </div>
  )
}
