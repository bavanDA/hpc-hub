import { useEffect, useState } from 'react'

import { call } from '../../../rpc'
import type { Limits, Profile } from '../../../types/clusters'

export function useLimits(cluster: string, p: Profile) {
  const [limits, setLimits] = useState<Limits | null>(null)
  useEffect(() => {
    let live = true  // an answer for what you picked before this is dropped
    const t = setTimeout(() => {
      call<Limits>('clusters.partitions', { cluster, partition: p.partition, qos: p.qos ?? '', account: p.account ?? '' })
        .then((l) => { if (live) setLimits({ ...l, asked: askedKey(p) }) }).catch(() => {})
    }, 250)
    return () => { live = false; clearTimeout(t) }
  }, [cluster, p.partition, p.qos, p.account])  // eslint-disable-line react-hooks/exhaustive-deps
  return limits
}

/** Which choices an answer is for: an answer about another partition must not change this one's priority. */
export const askedKey = (p: Profile) => [p.partition, p.qos ?? '', p.account ?? ''].join('|')
