// Clusters: one card each, to connect, get a compute node and see the log. Until each has a login, a card
// to bring them over from the desktop.
import { Server } from 'lucide-react'
import { useEffect } from 'react'

import { load, useClusters } from '@shared/components/clusters/store'
import { EmptyState, Spinner } from '@shared/components/ui'
import { ClusterCard } from '../parts/ClusterCard'
import { Header } from '../parts/Header'
import { SetupCard } from '../parts/SetupCard'

export function Clusters() {
  const { clusters, sessions, logs, error } = useClusters()
  useEffect(load, [])
  return (
    <div className="flex h-full flex-col">
      <Header title="Clusters" />
      <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-4">
        {error && <EmptyState icon={Server} title="Could not load the clusters" text={error} />}
        {!clusters && !error && <div className="grid h-40 place-items-center"><Spinner size={28} /></div>}
        <div className="flex flex-col gap-4">
          {clusters && <SetupCard clusters={clusters} />}
          {clusters?.map((c) => (
            <ClusterCard key={c.id} cluster={c} log={logs[c.id] ?? []}
              session={sessions[c.id] ?? { id: c.id, state: 'Disconnected' }} />
          ))}
        </div>
      </div>
    </div>
  )
}
