import { useState, type ReactNode } from 'react'

import type { Session } from '../../types/clusters'
import type { Clip, Entry } from '../../types/files'
import { useToast } from '../useToast'
import { isDir, join } from './format'
import { memory } from './memory'
import { PasteDialog, type How } from './PasteDialog'

/** Copy puts an entry aside; Paste copies it into the open folder, asking how when it comes from another cluster. */
export function usePaste({ cluster, here, path, connected, sessions, start, setDialog, close }: {
  cluster: string; here: string; path: string; connected: boolean; sessions: Record<string, Session>
  start: (c: Clip, skip: string[], how: How, total: number) => void
  setDialog: (d: ReactNode) => void; close: () => void
}) {
  const toast = useToast()
  const [clip, setClipState] = useState<Clip | null>(memory.clip)
  const setClip = (c: Clip | null) => { memory.clip = c; setClipState(c) }

  const copy = (e: Entry) => setClip({ cluster, clusterName: here, path: join(path, e.name),
    name: e.name, folder: isDir(e) })

  const paste = () => {
    if (!clip) return
    if (!connected || !path) { toast('Open a folder to paste into first'); return }
    if (!sessions[clip.cluster]?.connected) {
      toast(`Connect to ${clip.clusterName} first, the copy comes from there`)
      return
    }
    const c = clip
    if (c.cluster === cluster) { setClip(null); start(c, [], 'laptop', 0); return }
    setDialog(<PasteDialog clip={c} dstName={here} dstDir={path} onClose={close}
      onGo={(skip, how, total) => { setClip(null); start(c, skip, how, total) }} />)
  }

  return { clip, drop: () => setClip(null), copy, paste }
}
