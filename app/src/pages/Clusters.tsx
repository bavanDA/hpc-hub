import { useEffect } from 'react'

import { ClusterCard } from '../components/ClusterCard'
import { load, useClusters } from '../components/clusters/store'
import { Spinner } from '../components/ui'

export function Clusters() {
  const { clusters, sessions, logs, error } = useClusters()
  useEffect(load, [])

  if (error) return <p className="p-8 text-bad">Could not load clusters: {error}</p>
  if (!clusters) return <div className="grid h-full place-items-center"><Spinner size={40} /></div>
  return (
    <div className="mx-auto flex max-w-[700px] flex-col gap-[18px] px-4 py-6">
      {clusters.map((c) => (
        <ClusterCard key={c.id} cluster={c} session={sessions[c.id] ?? { id: c.id, state: 'Disconnected' }}
          log={logs[c.id] ?? []} />
      ))}
    </div>
  )
}
