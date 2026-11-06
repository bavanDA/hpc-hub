// "All clusters" in the header's cluster picker, for a page that can show every cluster at once (Usage). The page
// offers it while it is open; the choice is kept for the next visit and starts on All.
import { useEffect, useSyncExternalStore } from 'react'

let all = true
let offered = 0
const subs = new Set<() => void>()
const emit = () => subs.forEach((fn) => fn())
const sub = (fn: () => void) => { subs.add(fn); return () => { subs.delete(fn) } }

export function setAllClusters(on: boolean) {
  if (on === all) return
  all = on
  emit()
}

export function useAllClusters() {
  return {
    all: useSyncExternalStore(sub, () => all),
    offered: useSyncExternalStore(sub, () => offered > 0),
    setAll: setAllClusters,
  }
}

/** For the page that shows every cluster: the picker lists All clusters while this page is open. */
export function useOfferAllClusters() {
  useEffect(() => {
    offered++
    emit()
    return () => { offered--; emit() }
  }, [])
}
