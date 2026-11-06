import { useCallback, useRef, useState } from 'react'

import { call } from '../../rpc'
import type { Item, Listing } from '../../types/globus'
import { useToast } from '../useToast'

export type Pane = {
  cluster: string
  listing: Listing | null
  error: string  // the folder could not be opened
  loading: boolean
  selected: Item | null
  path: string  // the folder shown, "" before the first one opened
  pick: (cluster: string) => void
  go: (path: string) => void
  reload: () => void
  select: (item: Item | null) => void
}

export function usePane(onWant: () => void): Pane {
  const toast = useToast()
  const [cluster, setCluster] = useState('')
  const [listing, setListing] = useState<Listing | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [selected, select] = useState<Item | null>(null)
  const paths = useRef<Record<string, string>>({})  // last folder per cluster
  const current = useRef({ cluster: '', ask: 0 })
  const want = useRef(onWant)
  want.current = onWant

  const load = useCallback((id: string, path: string) => {
    const ask = ++current.current.ask
    current.current.cluster = id
    setLoading(true)
    call<Listing>('globus.ls', { cluster: id, path })
      .then((l) => {
        if (ask !== current.current.ask) return
        if (l.state === 'ok') paths.current[id] = l.path
        if (l.state === 'consent' || l.state === 'domain') want.current()
        setListing(l)
        setError('')
        select(null)
      })
      .catch((e: Error) => {
        if (ask !== current.current.ask) return
        // a folder that would not open while one is shown: say so and stay
        if (paths.current[id] && path !== paths.current[id]) toast(`${e.message}`)
        else { setError(e.message); setListing(null) }
      })
      .finally(() => ask === current.current.ask && setLoading(false))
  }, [toast])

  const pick = useCallback((id: string) => {
    setCluster(id)
    setListing(null)
    setError('')
    select(null)
    load(id, paths.current[id] ?? '')
  }, [load])

  const shown = listing?.state === 'ok' && listing.cluster === cluster ? listing.path : ''
  return {
    cluster, listing, error, loading, selected, path: shown, pick, select,
    go: (path: string) => cluster && load(cluster, path),
    reload: () => cluster && load(cluster, paths.current[cluster] ?? ''),
  }
}
