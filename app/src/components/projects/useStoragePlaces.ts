import { useEffect, useState } from 'react'

import { call } from '../../rpc'
import type { CopyTarget, Place, Places } from '../../types/projects'

/** Home, Project and Scratch on the cluster the copy goes to, once it is connected. */
export function useStoragePlaces(dst: CopyTarget | undefined): Place[] {
  const [found, setFound] = useState<{ cluster: string; storage: Place[] }>({ cluster: '', storage: [] })
  useEffect(() => {
    if (!dst?.connected) return
    const cluster = dst.id
    call<Places>('projects.places', { cluster }).then((pl) => setFound({ cluster, storage: pl.storage }))
      .catch(() => {})
  }, [dst?.id, dst?.connected])
  return dst?.connected && found.cluster === dst.id ? found.storage : []
}
