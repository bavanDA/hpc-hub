import { useEffect, useState } from 'react'

import { call } from '../../../rpc'
import type { TmuxSession } from '../../../types/terminals'
import { useListings, type Listed, type Live } from '../../terminals/data'
import { inside } from './paths'

export type FolderSessions = { here: TmuxSession[]; others: TmuxSession[]; listed?: Listed; refresh: () => void }

/** The folder with its links followed, as tmux reports a terminal's folder. */
function useRealPath(cluster: string, folder: string) {
  const [real, setReal] = useState({ key: '', path: '' })
  const key = `${cluster}:${folder}`
  useEffect(() => {
    if (!cluster || !folder) return
    call<string>('files.real_path', { cluster, path: folder }).then((path) => setReal({ key, path })).catch(() => {})
  }, [cluster, folder, key])
  return real.key === key ? real.path : ''
}

/** The cluster's sessions, the ones working in folder (or its real path) first. Looked at again every 15 seconds. */
export function useFolderSessions(live: Live | null, folder: string): FolderSessions {
  const { listings, refresh } = useListings(live ? [live] : [])
  const listed = live ? listings[live.id] : undefined
  const all = listed?.listing?.sessions ?? []
  const real = useRealPath(live?.id ?? '', folder)
  const here = all.filter((s) => s.kind === 'tmux' && (inside(s.path, folder) || (!!real && inside(s.path, real))))
  return { here, others: all.filter((s) => !here.includes(s)), listed, refresh }
}
