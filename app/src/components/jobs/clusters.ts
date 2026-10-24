// Your clusters and their live session state, for pages that work on one cluster at a time (Jobs, Usage).
import { useEffect, useState } from 'react'

import { useEvent } from '../../hooks'
import { call } from '../../rpc'
import type { Cluster, Session } from '../../types'

// The cluster picked last, kept while the app runs so Jobs and Usage open on the same one
let picked = ''

export function useClusters() {
  const [clusters, setClusters] = useState<Cluster[] | null>(null)
  const [sessions, setSessions] = useState<Record<string, Session>>({})
  const [error, setError] = useState('')
  const [pick, setPick] = useState(picked)

  useEffect(() => {
    call<Cluster[]>('clusters.list').then(setClusters).catch((e: Error) => setError(e.message))
    call<Session[]>('sessions.list')
      .then((all) => setSessions((now) => ({ ...Object.fromEntries(all.map((s) => [s.id, s])), ...now })))
      .catch(() => {})
  }, [])
  useEvent<Session>('session', (s) => setSessions((now) => ({ ...now, [s.id]: s })))

  // Until you pick one: the first connected cluster
  const cluster = clusters?.find((c) => c.id === pick) ??
    clusters?.find((c) => sessions[c.id]?.state === 'Connected') ?? clusters?.[0] ?? null
  const session = cluster ? sessions[cluster.id] : undefined
  const setCluster = (id: string) => { picked = id; setPick(id) }
  return { clusters, cluster, session, connected: session?.state === 'Connected', setCluster, error }
}

/** Why a page has nothing to show for a cluster that is not connected. */
export function notConnected(name: string, s: Session | undefined, what: string) {
  if (s?.state === 'Error' && s.detail === 'Connection lost') {
    return { title: 'Connection lost',
      text: `${name} dropped, for example after the laptop slept. Press Reconnect on the Clusters tab.` }
  }
  return { title: 'Not connected', text: `Connect to ${name} to see ${what}.` }
}
