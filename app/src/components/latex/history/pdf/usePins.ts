import { useEffect, useState } from 'react'

import { call } from '../../../../rpc'
import type { Note, SyncSpot } from '../../../../types/history'
import type { Where } from '../git'
import { isLine, isPage } from '../notes/places'
import type { PinAt } from './types'

/** Where the notes sit on the PDF: a spot as it is, a line through SyncTeX. */
export function usePins(where: Where, main: string, root: string, notes: Note[]): PinAt[] {
  const [pins, setPins] = useState<PinAt[]>([])
  const key = JSON.stringify(notes.filter((n) => n.place && !('hash' in n.place)).map((n) => [n.id, n.place, n.done]))
  useEffect(() => {
    let dead = false
    const placed = (JSON.parse(key) as [string][]).map(([id]) => notes.find((n) => n.id === id)!).filter(Boolean)
    const out: PinAt[] = placed.filter((n) => isPage(n.place)).map((n) => {
      const p = n.place as { page: number; y: number }
      return { id: n.id, n: n.n, page: p.page, y: p.y, done: n.done, text: n.text }
    })
    const byPath = new Map<string, Note[]>()
    for (const n of placed) if (isLine(n.place)) byPath.set(n.place.path, [...(byPath.get(n.place.path) ?? []), n])
    ;(async () => {
      for (const [path, list] of byPath) {
        const spots = await call<SyncSpot[]>('latex.git_sync_lines', { cluster: where.cluster, main, path: `${root}/${path}`,
          lines: list.map((n) => (n.place as { line: number }).line) }).catch(() => [] as SyncSpot[])
        list.forEach((n, k) => { const s = spots[k]; if (s) out.push({ id: n.id, n: n.n, page: s.page, y: s.y, done: n.done, text: n.text }) })
      }
      if (!dead) setPins(out)
    })()
    return () => { dead = true }
    // notes is read through key
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, where, main, root])
  return pins
}
