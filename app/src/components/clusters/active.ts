import { useEffect, useSyncExternalStore } from 'react'

import type { Cluster, Session } from '../../types'
import { load, useClusters } from './store'

let active = ''
const subs = new Set<() => void>()

export function setActiveCluster(id: string) {
  if (id === active) return
  active = id
  subs.forEach((fn) => fn())
}

const useActiveId = () => useSyncExternalStore((fn) => { subs.add(fn); return () => subs.delete(fn) }, () => active)

/** Which cluster: the one you picked, else the first connected one, else the first. null while loading. */
export function pickCluster(clusters: Cluster[] | null, sessions: Record<string, Session>, id: string) {
  return clusters?.find((c) => c.id === id) ?? clusters?.find((c) => sessions[c.id]?.connected) ??
    clusters?.[0] ?? null
}

export function useActiveCluster() {
  const { clusters, sessions, error, ready } = useClusters()
  const id = useActiveId()
  useEffect(load, [])
  const cluster = ready ? pickCluster(clusters, sessions, id) : null
  const session = cluster ? sessions[cluster.id] : undefined
  return {
    clusters, sessions, cluster, session, connected: !!session?.connected, error,
    setCluster: setActiveCluster,
  }
}
