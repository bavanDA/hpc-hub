import type { Cluster } from '../../../types/clusters'

/** First-time setup asks only how you sign in to each cluster you picked: your username and password. The compute
 * node keeps its defaults (a node when you connect, 2 cores, 16 GB, 4 hours), which Settings can change any time. */
export type Step = { cluster: Cluster; kind: 'login' }

/** The steps for the clusters you picked, in that order; ids no longer known are left out. */
export function setupSteps(ids: string[], all: Cluster[]): Step[] {
  return ids.flatMap((id) => {
    const c = all.find((x) => x.id === id)
    return c ? [{ cluster: c, kind: 'login' as const }] : []
  })
}
