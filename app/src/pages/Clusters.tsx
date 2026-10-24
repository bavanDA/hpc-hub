import { useEffect, useState } from 'react'

import { ClusterCard } from '../components/ClusterCard'
import { call } from '../rpc'
import type { Cluster, Session } from '../types'

export function Clusters() {
  const [clusters, setClusters] = useState<Cluster[] | null>(null)
  const [sessions, setSessions] = useState<Record<string, Session>>({})
  const [error, setError] = useState('')

  useEffect(() => {
    call<Cluster[]>('clusters.list').then(setClusters).catch((e: Error) => setError(e.message))
    call<Session[]>('sessions.list')
      .then((all) => setSessions(Object.fromEntries(all.map((s) => [s.id, s]))))
      .catch(() => {})  // not in the backend yet: everything shows disconnected
  }, [])

  if (error) return <p className="p-8 text-bad">Could not load clusters: {error}</p>
  if (!clusters) return <p className="p-8 text-dim">Loading…</p>
  return (
    <div className="mx-auto flex max-w-[760px] flex-col gap-[18px] px-4 py-6">
      {clusters.map((c) => (
        <ClusterCard key={c.id} cluster={c} session={sessions[c.id] ?? { id: c.id, state: 'Disconnected' }} />
      ))}
    </div>
  )
}
