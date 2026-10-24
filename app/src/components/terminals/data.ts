// Which clusters are connected, and the tmux sessions on each (looked at again every 15 seconds).
import { useCallback, useEffect, useState } from 'react'

import { useEvent } from '../../hooks'
import { call } from '../../rpc'
import type { Cluster, Session } from '../../types'
import type { Listing } from '../../types/terminals'

export type Live = { id: string; name: string; node: string; job: string }

const REFRESH_MS = 15000

export function useLive(): Live[] {
  const [clusters, setClusters] = useState<Cluster[]>([])
  const [sessions, setSessions] = useState<Record<string, Session>>({})
  useEffect(() => {
    call<Cluster[]>('clusters.list').then(setClusters).catch(() => {})
    call<Session[]>('sessions.list').then((all) => setSessions(Object.fromEntries(all.map((s) => [s.id, s]))))
      .catch(() => {})
  }, [])
  useEvent<Session>('session', (s) => setSessions((all) => ({ ...all, [s.id]: s })))
  return clusters.filter((c) => sessions[c.id]?.connected)
    .map((c) => ({ id: c.id, name: c.name, node: sessions[c.id].node ?? '', job: sessions[c.id].job ?? '' }))
}

export type Listed = { listing?: Listing; error?: string }

export function useListings(live: Live[]) {
  const [listings, setListings] = useState<Record<string, Listed>>({})
  const ids = live.map((c) => c.id).join(' ')
  const refresh = useCallback(() => {
    for (const id of ids.split(' ').filter(Boolean)) {
      call<Listing>('terminals.list', { cluster: id })
        .then((listing) => setListings((all) => ({ ...all, [id]: { listing } })))
        .catch((e: Error) => setListings((all) => ({ ...all, [id]: { ...all[id], error: e.message } })))
    }
  }, [ids])
  useEffect(() => {
    refresh()
    const timer = setInterval(refresh, REFRESH_MS)
    return () => clearInterval(timer)
  }, [refresh])
  return { listings, refresh }
}
