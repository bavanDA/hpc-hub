import { useEffect, useState } from 'react'

import { call } from '../../../rpc'
import type { Limits, Profile } from '../../../types/clusters'

export function useLimits(cluster: string, p: Profile) {
  const [limits, setLimits] = useState<Limits | null>(null)
  useEffect(() => {
    const t = setTimeout(() => {
      call<Limits>('clusters.partitions', { cluster, partition: p.partition, qos: p.qos ?? '', account: p.account ?? '' })
        .then(setLimits).catch(() => {})
    }, 250)
    return () => clearTimeout(t)
  }, [cluster, p.partition, p.qos, p.account])
  return limits
}
