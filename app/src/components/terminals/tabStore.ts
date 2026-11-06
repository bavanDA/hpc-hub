import { onThemeChange } from '../../theme'
import type { Tab } from './tabs'
import { theme } from './xterm'

export type TabState = { tabs: Tab[]; current: string | null }

let state: TabState = { tabs: [], current: null }
const subscribers = new Set<() => void>()

// Light or dark follows Settings, Appearance, also for terminals already open
onThemeChange(() => {
  for (const t of state.tabs) t.term.options.theme = theme()
})

export const getState = () => state

export function changed(next: Partial<TabState> = {}) {
  state = { ...state, ...next }
  subscribers.forEach((fn) => fn())
}

export function subscribe(fn: () => void) {
  subscribers.add(fn)
  return () => { subscribers.delete(fn) }
}

export const select = (key: string | null) => changed({ current: key })
export const getTab = (key: string) => state.tabs.find((t) => t.key === key)
