import type { Profile } from '../../../types/clusters'

/** Each size's own settings per cluster, so going to GPU and back leaves Small as you left it. */
const kept = new Map<string, { tab: string; sizes: Record<string, Profile> }>()
export const keptFor = (cluster: string) => kept.get(cluster) ?? kept.set(cluster, { tab: '', sizes: {} }).get(cluster)!
export const remember = (cluster: string, tab: string, p: Profile) => {
  const k = keptFor(cluster)
  k.sizes[tab] = p
  k.tab = tab
}
