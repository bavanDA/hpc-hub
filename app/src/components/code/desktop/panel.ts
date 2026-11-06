import { useSyncExternalStore } from 'react'

import { isMac } from '../../app/platform'
import { close } from '../../terminals/tabs'

export const TOGGLE_KEY = 'Ctrl+`'
export const isToggle = (e: KeyboardEvent) => e.ctrlKey && !e.altKey && !e.shiftKey && !(isMac && e.metaKey) &&
  (e.code === 'Backquote' || e.key === '`')

/** The terminal panel's tabs per cluster and folder, outside React so they stay while you visit other pages. */
type Tabs = { keys: string[]; current: string }
const NONE: Tabs = { keys: [], current: '' }
let tabs: Record<string, Tabs> = {}
const subs = new Set<() => void>()
const where = (cluster: string, folder: string) => `${cluster}\n${folder}`

function set(at: string, next: Tabs) {
  tabs = { ...tabs, [at]: next }
  subs.forEach((fn) => fn())
}

/** The panel's tabs (terminal tab keys, see terminals/tabs.ts) for this cluster and folder. */
export function usePanelTabs(cluster: string, folder: string) {
  const at = where(cluster, folder)
  const now = useSyncExternalStore((fn) => { subs.add(fn); return () => subs.delete(fn) }, () => tabs[at] ?? NONE)
  const get = () => tabs[at] ?? NONE
  return {
    ...now,
    add: (key: string) => set(at, { keys: get().keys.includes(key) ? get().keys : [...get().keys, key], current: key }),
    pick: (key: string) => set(at, { ...get(), current: key }),
    drop: (key: string) => set(at, { ...get(), keys: get().keys.filter((k) => k !== key) }),
  }
}

/** Close the folder's terminal tabs (the sessions keep running), as when the project closes. */
export function closeFolderTerminals(cluster: string, folder: string) {
  const at = where(cluster, folder)
  for (const key of tabs[at]?.keys ?? []) close(key)
  set(at, NONE)
}
