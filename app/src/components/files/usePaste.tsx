import { useState, type ReactNode } from 'react'

import type { Session } from '../../types/clusters'
import type { Clip, Entry, Held } from '../../types/files'
import { useToast } from '../useToast'
import { ConfirmDialog } from './ConfirmDialog'
import { isDir, join } from './format'
import { memory } from './memory'
import { PasteDialog, type How } from './PasteDialog'

/** Copy or Move puts entries aside; Paste copies them into the open folder (asking how when they come from another
 * cluster) or moves them there (on the same cluster). */
export function usePaste({ cluster, here, path, connected, sessions, start, moveInto, setDialog, close }: {
  cluster: string; here: string; path: string; connected: boolean; sessions: Record<string, Session>
  start: (c: Clip, skip: string[], how: How, total: number) => void
  moveInto: (paths: string[], folder: string) => void
  setDialog: (d: ReactNode) => void; close: () => void
}) {
  const toast = useToast()
  const [held, setHeldState] = useState<Held | null>(memory.held)
  const setHeld = (h: Held | null) => { memory.held = h; setHeldState(h) }

  const hold = (entries: Entry[], move = false) => {
    if (!entries.length) return
    setHeld({ move, items: entries.map((e) => ({ cluster, clusterName: here, path: join(path, e.name), name: e.name,
      folder: isDir(e) })) })
  }

  const paste = () => {
    if (!held) return
    if (!connected || !path) { toast('Open a folder to paste into first'); return }
    const { items, move } = held
    const from = items[0]
    if (move) {
      if (from.cluster !== cluster) {
        toast(`Moving works inside one cluster. To bring it from ${from.clusterName}, use Copy`)
        return
      }
      setHeld(null)
      moveInto(items.map((c) => c.path), path)
      return
    }
    if (!sessions[from.cluster]?.connected) {
      toast(`Connect to ${from.clusterName} first, the copy comes from there`)
      return
    }
    const all = () => { setHeld(null); items.forEach((c) => start(c, [], 'laptop', 0)) }
    if (from.cluster === cluster) { all(); return }
    if (items.length === 1) {
      setDialog(<PasteDialog clip={from} dstName={here} dstDir={path} onClose={close}
        onGo={(skip, how, total) => { setHeld(null); start(from, skip, how, total) }} />)
      return
    }
    setDialog(<ConfirmDialog title={`Copy ${items.length} items to ${here}?`} action="Copy" keep="Cancel" onClose={close}
      text={`They come from ${from.clusterName} through this laptop, one after another. Keep HPC Hub open until done.`}
      onYes={all} />)
  }

  return { held, drop: () => setHeld(null), hold, paste }
}
