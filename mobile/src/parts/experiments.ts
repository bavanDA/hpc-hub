// Which experimental parts are on, from the backend's three switches (Settings). The drawer, Agents and Papers read
// it; Settings hands it the answer after a change.
import { useEffect, useSyncExternalStore } from 'react'

import { experimentsOf, NO_EXPERIMENTS, type Experiments, type Preferences } from '@shared/components/app/types'
import { call } from '@shared/rpc'

/** read: the backend has answered. Before that everything is off. */
type State = Experiments & { read: boolean }

let state: State = { ...NO_EXPERIMENTS, read: false }
const subs = new Set<() => void>()

export function setExperiments(e: Experiments) {
  state = { ...e, read: true }
  subs.forEach((fn) => fn())
}

export function useExperiments(): State {
  useEffect(() => {
    if (state.read) return
    call<Preferences>('preferences.get').then((p) => setExperiments(experimentsOf(p)))
      .catch(() => setExperiments(NO_EXPERIMENTS))
  }, [])
  return useSyncExternalStore((fn) => { subs.add(fn); return () => subs.delete(fn) }, () => state)
}
