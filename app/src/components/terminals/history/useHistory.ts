import { useEffect, useMemo, useSyncExternalStore } from 'react'

import type { Tab } from '../tabs'
import { historyOf, type HistoryView } from './view'

export const hasHistory = (tab: Tab) => tab.kind === 'tmux' && !!tab.session && !!tab.cluster

/** The tab's history: the map and the marks are read when it comes on screen, and again after it reconnects. */
export function useHistory(tab: Tab, shown: boolean): HistoryView {
  const view = useMemo(() => historyOf(tab), [tab])
  useSyncExternalStore(view.subscribe, () => view.version)
  const on = shown && hasHistory(tab)
  useEffect(() => { if (on) view.refresh() }, [on, tab.pty, tab.node, view])
  useEffect(() => {
    if (!tab.term.onLineFeed) return
    const d = tab.term.onLineFeed(() => view.noteOutput())
    return () => d.dispose()
  }, [tab, view])
  return view
}
