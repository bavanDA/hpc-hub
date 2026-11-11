// Clusters: one block each, to connect, get a compute node and open things on it. On the very first start, Welcome
// asks which clusters you use and how you sign in to each. No status strip here: each block shows its own node.
import { Server } from 'lucide-react'
import { useEffect, useState } from 'react'

import type { SetupStatus } from '@shared/components/app/setup'
import { load, useClusters } from '@shared/components/clusters/store'
import { Spinner } from '@shared/components/ui/Spinner'
import { call } from '@shared/rpc'
import { ClusterCard } from '../parts/ClusterCard'
import { Header } from '../parts/Header'
import { Welcome } from '../parts/Welcome'
import { EmptyState } from '../ui'

export function Clusters() {
  const { clusters, sessions, logs, error } = useClusters()
  const [setup, setSetup] = useState<SetupStatus | null>(null)
  useEffect(load, [])
  useEffect(() => { call<SetupStatus>('setup.status').then(setSetup).catch(() => {}) }, [])

  if (setup?.first_run) {
    // the clusters you didn't pick go away: start over with the new list (the demo keeps its own)
    const done = () => { setSetup({ ...setup, first_run: false }); if ('__TAURI_INTERNALS__' in window) location.reload() }
    return <Welcome status={setup} onDone={done} />
  }
  const session = (id: string) => sessions[id] ?? { id, state: 'Disconnected' as const }
  // one main button on the screen: Connect on the first cluster that isn't connected
  const first = clusters?.find((c) => ['Disconnected', 'Error'].includes(session(c.id).state))?.id
  return (
    <div className="flex h-full flex-col">
      <Header title="Clusters" />
      <div className="min-h-0 flex-1 overflow-y-auto pb-6">
        {error && <EmptyState icon={Server} title="Couldn't load the clusters" text={error} />}
        {!clusters && !error && <div className="grid h-40 place-items-center"><Spinner size={28} /></div>}
        <div className="flex flex-col gap-2.5 pt-3">
          {clusters?.map((c) => (
            <ClusterCard key={c.id} cluster={c} log={logs[c.id] ?? []} session={session(c.id)}
              primary={c.id === first} />
          ))}
        </div>
      </div>
    </div>
  )
}
