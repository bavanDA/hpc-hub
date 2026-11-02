// Clusters: one card each, to connect, get a compute node and open things on it.
import { useEffect } from 'react'

import { ClusterCard } from '../components/ClusterCard'
import { load, useClusters } from '../components/clusters/store'
import { Spinner } from '../components/ui'

export function Clusters() {
  const { clusters, sessions, logs, error } = useClusters()
  useEffect(load, [])

  if (error) return <p className="p-8 text-bad">Couldn't load the clusters: {error}</p>
  if (!clusters) return <div className="grid h-full place-items-center"><Spinner size={40} /></div>
  const session = (id: string) => sessions[id] ?? { id, state: 'Disconnected' as const }
  // one main button on the page: Connect on the first cluster that isn't connected
  const first = clusters.find((c) => ['Disconnected', 'Error'].includes(session(c.id).state))?.id
  return (
    <div className="mx-auto flex max-w-[700px] flex-col gap-[18px] px-4 py-6">
      {clusters.map((c) => (
        <ClusterCard key={c.id} cluster={c} session={session(c.id)} log={logs[c.id] ?? []} primary={c.id === first} />
      ))}
    </div>
  )
}
