// More: usage (SU left), agent permissions, settings, and what the app is. The same order as the desktop sidebar.
import { ChevronRight } from 'lucide-react'
import { lazy, Suspense, useEffect, useState } from 'react'

import { setActiveCluster } from '@shared/components/clusters/active'
import { load, useClusters } from '@shared/components/clusters/store'
import { setMonitorBar } from '@shared/components/terminals/MonitorBar'
import { ToastProvider as SharedToasts } from '@shared/components/toast'
import { Meter, Spinner } from '@shared/components/ui'
import { call } from '@shared/rpc'
import type { Cluster } from '@shared/types/clusters'
import type { Account } from '@shared/types/usage'
import { Header } from '../parts/Header'
import { Card, Sheet, Switch, useToast } from '../ui'

const Permissions = lazy(() => import('@shared/pages/Permissions').then((m) => ({ default: m.Permissions })))

type Prefs = { monitor_bar: boolean }

const su = (n: number) => Math.round(n).toLocaleString('en-US')

function UsageCard({ cluster }: { cluster: Cluster }) {
  const [accounts, setAccounts] = useState<Account[] | null>(null)
  const [error, setError] = useState('')
  useEffect(() => {
    call<Account[]>('usage.accounts', { cluster: cluster.id }).then(setAccounts).catch((e: Error) => setError(e.message))
  }, [cluster.id])
  return (
    <Card className="mb-3">
      <p className="mb-2 font-bold">{cluster.name}</p>
      {error && <p className="text-sm text-bad">{error}</p>}
      {!accounts && !error && <Spinner />}
      {accounts?.length === 0 && <p className="text-sm text-dim">No Slurm accounts found.</p>}
      {accounts?.map((a) => (
        <div key={a.account} className="mt-2 first:mt-0">
          <div className="flex items-baseline gap-2">
            <span className="min-w-0 flex-1 truncate">{a.account}</span>
            <span className="text-sm font-semibold">
              {a.quota ? `${su(Math.max(0, a.quota - a.used))} SU left` : `${su(a.used)} SU used`}</span>
          </div>
          {a.quota > 0 && <Meter value={a.used / a.quota} label={`${a.account} SU used`} className="mt-1.5" />}
        </div>
      ))}
    </Card>
  )
}

export function More() {
  const toast = useToast()
  const { clusters, sessions } = useClusters()
  const [prefs, setPrefs] = useState<Prefs | null>(null)
  const [perms, setPerms] = useState<Cluster | null>(null)
  useEffect(load, [])
  useEffect(() => { call<Prefs>('preferences.get').then(setPrefs).catch((e: Error) => toast(e.message)) }, [toast])
  const up = (clusters ?? []).filter((c) => sessions[c.id]?.connected)

  async function save(change: Partial<Prefs>) {
    try {
      const p = await call<Prefs>('preferences.set', change)
      setPrefs(p)
      setMonitorBar(p.monitor_bar)
    } catch (e) {
      toast((e as Error).message)
    }
  }

  return (
    <div className="flex h-full flex-col">
      <Header title="More" />
      <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-4">
        <h2 className="mb-2 text-sm font-bold text-dim">Usage</h2>
        {up.map((c) => <UsageCard key={c.id} cluster={c} />)}
        {!up.length && <Card className="mb-5"><p className="text-sm text-dim">Connect a cluster to see its SU.</p></Card>}

        <h2 className="mt-5 mb-2 text-sm font-bold text-dim">Agent permissions</h2>
        <Card className="mb-5 py-1">
          {(clusters ?? []).map((c) => (
            <button key={c.id} onClick={() => { setActiveCluster(c.id); setPerms(c) }}
              className="flex min-h-14 w-full items-center gap-3 py-2 text-left active:bg-hover">
              <span className="min-w-0 flex-1">
                <span className="block truncate">{c.name}</span>
                <span className="block text-sm text-dim">What Claude may do there without asking</span>
              </span>
              <ChevronRight size={20} className="text-dim" />
            </button>
          ))}
        </Card>

        <h2 className="mb-2 text-sm font-bold text-dim">Settings</h2>
        <Card className="mb-5 py-1">
          <Switch label="Monitoring bar" hint="CPU, memory and network of the host, under each terminal."
            checked={prefs?.monitor_bar ?? true} onChange={(on) => save({ monitor_bar: on })} />
        </Card>
        <h2 className="mb-2 text-sm font-bold text-dim">About</h2>
        <Card>
          <p className="font-bold">HPC Hub 0.1.0</p>
          <p className="text-sm text-dim">Your HPC clusters in one place. Open source, MIT license.</p>
        </Card>
      </div>
      {perms && (
        <Sheet title={`Agent permissions on ${perms.name}`} onClose={() => setPerms(null)}>
          <SharedToasts>
            <Suspense fallback={<Spinner />}><Permissions /></Suspense>
          </SharedToasts>
        </Sheet>
      )}
    </div>
  )
}
