// The connected clusters, and which one a screen shows: the cluster picked anywhere in the app (clusters/active.ts,
// shared with the desktop's pages), else the first connected one. pick() changes it for every screen.
import { setActiveCluster, useActiveCluster } from '@shared/components/clusters/active'

export function useConnected() {
  const { clusters, sessions, cluster } = useActiveCluster()
  const live = (clusters ?? []).filter((c) => sessions[c.id]?.connected)
  const current = live.find((c) => c.id === cluster?.id) ?? live[0] ?? null
  return { live, current, session: current ? sessions[current.id] : null, pick: setActiveCluster }
}
