// What "Copy, then paste anywhere" put aside: one file or folder, kept while you move to another folder or cluster.
import { useSyncExternalStore } from 'react'

import type { Clip } from '@shared/types/files'

let clip: Clip | null = null
const listeners = new Set<() => void>()

export function setClip(c: Clip | null) {
  clip = c
  listeners.forEach((l) => l())
}

export function useClip(): Clip | null {
  return useSyncExternalStore((l) => { listeners.add(l); return () => listeners.delete(l) }, () => clip)
}
