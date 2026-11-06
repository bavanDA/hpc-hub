import { useCallback, useEffect, useRef, useState } from 'react'

import { call } from '../../rpc'
import type { Cluster } from '../../types/clusters'
import type { Listing, Place } from '../../types/files'
import { useToast } from '../toast'
import { memory } from './memory'

/** The folder shown on a cluster: its listing, the places to jump to, and going somewhere else. */
export function useListing(cluster: string, connected: boolean, clusters: Cluster[] | null | undefined) {
  const toast = useToast()
  const [listing, setListing] = useState<Listing | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [places, setPlaces] = useState<Place[]>([])
  const [selected, setSelected] = useState<string | null>(null)
  const asked = useRef(0)  // the newest listing asked for; older answers are dropped
  const path = listing?.path ?? ''
  const shown = useRef(path)
  useEffect(() => { shown.current = path }, [path])

  const go = useCallback((target: string) => {
    if (!cluster) return
    const n = ++asked.current
    setLoading(true)
    call<Listing>('files.list', { cluster, path: target })
      .then((l) => {
        if (n !== asked.current) return
        memory.paths[cluster] = l.path
        if (l.path !== shown.current) setSelected(null)
        setListing(l)
        setError('')
      })
      .catch((e: Error) => {
        if (n !== asked.current) return
        toast(`${clusters?.find((c) => c.id === cluster)?.name ?? cluster}: ${e.message}`)
        if (!shown.current) setError(e.message)
      })
      .finally(() => n === asked.current && setLoading(false))
  }, [cluster, clusters, toast])

  useEffect(() => {  // a new cluster, or it just connected or dropped
    setListing(null)
    setSelected(null)
    setPlaces([])
    setError('')
    if (!connected) return
    go(memory.paths[cluster] ?? '')
    call<Place[]>('files.places', { cluster }).then(setPlaces).catch(() => {})
  }, [cluster, connected, go])

  return { listing, path, loading, error, places, selected, setSelected, go }
}
