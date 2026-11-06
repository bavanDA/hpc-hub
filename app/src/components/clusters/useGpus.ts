import { useEffect, useState } from 'react'

import { call } from '../../rpc'
import type { Gpu } from './gpus'

export function useGpus(cluster: string) {
  const [gpus, setGpus] = useState<Gpu[]>([])
  const [known, setKnown] = useState(false)
  useEffect(() => {
    call<{ known: boolean; gpus: Gpu[] }>('clusters.gpus', { cluster })
      .then((r) => { setGpus(r.gpus); setKnown(r.known) }).catch(() => setGpus([]))
  }, [cluster])
  return { gpus, known }
}
