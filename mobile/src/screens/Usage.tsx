// More › Usage: SU left in an account and who used it, storage quotas, and how busy the cluster is, for the cluster
// picked anywhere in the app. Account and period are pickers; tapping a person opens Jobs on their jobs.
import { ChevronDown, CircleAlert, RefreshCw, WifiOff } from 'lucide-react'
import { useState } from 'react'

import { useRemote } from '@shared/components/usage/useRemote'
import { EmptyState, Spinner } from '@shared/components/ui'
import { useGo } from '@shared/nav'
import type { Account, Partition, People, Storage } from '@shared/types/usage'
import { usePhoneNav } from '../nav'
import { Header } from '../parts/Header'
import { LoadView } from '../parts/usage/LoadView'
import { StorageView } from '../parts/usage/StorageView'
import { SuView } from '../parts/usage/SuView'
import { useConnected } from '../parts/useConnected'
import { Button, PickerSheet, Segments } from '../ui'

const PERIODS = [['7', 'Last 7 days'], ['30', 'Last 30 days'], ['90', 'Last 90 days'], ['365', 'Last year']] as const
type View = 'su' | 'storage' | 'load'
const VIEWS = [['su', 'SU'], ['storage', 'Storage'], ['load', 'Load']] as const

function PickerButton({ label, value, onClick, disabled = false }:
  { label: string; value: string; onClick: () => void; disabled?: boolean }) {
  return (
    <button onClick={onClick} disabled={disabled} className="flex h-12 min-w-0 flex-1 items-center gap-2 rounded-xl
      bg-pill px-4 text-left active:bg-selected disabled:opacity-50">
      <span className="min-w-0 flex-1">
        <span className="block text-xs font-semibold text-dim">{label}</span>
        <span className="block truncate text-sm font-semibold">{value}</span>
      </span>
      <ChevronDown size={18} className="shrink-0 text-dim" />
    </button>
  )
}

export function Usage() {
  const { live, current, pick: pickCluster } = useConnected()
  const { open: openTab } = usePhoneNav()
  const go = useGo()
  const [view, setView] = useState<View>('su')
  const [days, setDays] = useState<string>('30')
  const [chosen, setChosen] = useState('')
  const [picking, setPicking] = useState<'' | 'account' | 'period'>('')
  const [tick, setTick] = useState(0)
  const id = current?.id ?? ''

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

  let body
  if (accounts.error) body = <EmptyState icon={CircleAlert} title="Couldn't read the accounts" text={accounts.error} />
  else if (!accounts.data) body = <div className="grid h-40 place-items-center"><Spinner size={28} /></div>
  else if (view === 'su') {
    body = account
      ? <SuView account={account} people={people.data} error={people.error} period={period}
          onPerson={(user) => go('jobs', { cluster: id, user })} />
      : <EmptyState icon={CircleAlert} title="No Slurm account" text="This cluster didn't list an account for you." />
  } else if (view === 'storage') {
    body = storage.error ? <p className="text-bad">Couldn't load storage: {storage.error}</p>
      : storage.data ? <StorageView storage={storage.data} />
      : <div className="grid h-40 place-items-center"><Spinner size={28} /></div>
  } else {
    body = load.error ? <p className="text-bad">Couldn't load the partitions: {load.error}</p>
      : load.data ? <LoadView name={current?.name ?? ''} parts={load.data} />
      : <div className="grid h-40 place-items-center"><Spinner size={28} /></div>
  }

  return (
    <div className="flex h-full flex-col">
      <Header title="Usage">
        {current && <button aria-label="Refresh" onClick={() => setTick(tick + 1)}
          className="grid size-12 place-items-center rounded-full active:bg-hover">
          {busy && accounts.data ? <Spinner size={22} /> : <RefreshCw size={22} />}</button>}
      </Header>
      {!current
        ? <div className="flex flex-1 flex-col items-center justify-center gap-4 px-6">
            <EmptyState icon={WifiOff} title="No cluster connected" text="Connect a cluster to see its SU, storage and load." />
            <Button kind="primary" onClick={() => openTab('clusters')}>Go to Clusters</Button>
          </div>
        : (
          <div className="flex min-h-0 flex-1 flex-col gap-3 px-4">
            {live.length > 1 && <Segments value={current.id} options={live.map((c) => [c.id, c.name] as const)}
              onChange={pickCluster} />}
            <Segments value={view} options={VIEWS} onChange={setView} />
            {view !== 'load' && (
              <div className="flex gap-2">
                <PickerButton label="Account" value={name || 'None'} disabled={list.length < 2}
                  onClick={() => setPicking('account')} />
                {view === 'su' && <PickerButton label="Period" value={period} onClick={() => setPicking('period')} />}
              </div>
            )}
            <div className="min-h-0 flex-1 overflow-y-auto pb-4">{body}</div>
          </div>
        )}
      {picking === 'account' && <PickerSheet title="Account" value={name} onClose={() => setPicking('')}
        onPick={setChosen} options={list.map((a) => ({ value: a.account, label: a.account,
          hint: a.quota ? `${Math.max(0, Math.round(a.quota - a.used)).toLocaleString('en-US')} SU left` : undefined }))} />}
      {picking === 'period' && <PickerSheet title="Period" value={days} onClose={() => setPicking('')}
        onPick={setDays} options={PERIODS.map(([value, label]) => ({ value, label }))} />}
    </div>
  )
}
