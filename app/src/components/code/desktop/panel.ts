// What the Code page's terminal panel keeps outside React, so it stays while you visit other pages: its tabs and the
// one shown per cluster and folder, and the cluster's sessions with the ones working in the folder first.
import { useSyncExternalStore } from 'react'

import { isMac } from '../../app/platform'
import { sessionKind, type TmuxSession } from '../../../types/terminals'
import { useListings, type Listed, type Live } from '../../terminals/data'
import { close } from '../../terminals/tabs'
import { inside, tilde } from './workspace'

export const TOGGLE_KEY = 'Ctrl+`'
export const isToggle = (e: KeyboardEvent) => e.ctrlKey && !e.altKey && !e.shiftKey && !(isMac && e.metaKey) &&
  (e.code === 'Backquote' || e.key === '`')

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

export type FolderSessions = { here: TmuxSession[]; others: TmuxSession[]; listed?: Listed; refresh: () => void }

/** The cluster's sessions, the ones working in folder first. Looked at again every 15 seconds. */
export function useFolderSessions(live: Live | null, folder: string): FolderSessions {
  const { listings, refresh } = useListings(live ? [live] : [])
  const listed = live ? listings[live.id] : undefined
  const all = listed?.listing?.sessions ?? []
  const here = all.filter((s) => s.kind === 'tmux' && inside(s.path, folder))
  return { here, others: all.filter((s) => !here.includes(s)), listed, refresh }
}

function ago(ts: number): string {
  if (!ts) return ''
  const m = Math.floor(Math.max(0, Date.now() / 1000 - ts) / 60)
  return m < 60 ? `${m} min` : m < 48 * 60 ? `${Math.floor(m / 60)} h` : `${Math.floor(m / 1440)} days`
}

/** What runs in it, where, and since when: "python · n0042 · src · 3 h". */
export function about(s: TmuxSession, folder: string, home: string): string {
  const what = sessionKind(s)
  const dir = !s.path ? '' : inside(s.path, folder) ? s.path.slice(folder.length + 1) : tilde(s.path, home)
  return [what, s.node || 'login node', dir, ago(s.created)].filter(Boolean).join(' · ')
}
