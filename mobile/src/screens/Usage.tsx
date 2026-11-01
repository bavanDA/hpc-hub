// More › Usage: SU left in each of your accounts on the connected clusters. Per person, storage and load come next.
import { useEffect, useState } from 'react'

import { Meter, Spinner } from '@shared/components/ui'
import { call } from '@shared/rpc'
import type { Cluster } from '@shared/types/clusters'
import type { Account } from '@shared/types/usage'
import { Header } from '../parts/Header'
import { useConnected } from '../parts/useConnected'
import { Card } from '../ui'

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

export function Usage() {
  const { live } = useConnected()
  return (
    <div className="flex h-full flex-col">
      <Header title="Usage" />
      <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-4">
        {live.map((c) => <UsageCard key={c.id} cluster={c} />)}
        {!live.length && <Card><p className="text-sm text-dim">Connect a cluster to see its SU.</p></Card>}
      </div>
    </div>
  )
}
