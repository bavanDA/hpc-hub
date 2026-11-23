// Yale's key page opens only on Yale's network: campus, HPC Hub's VPN, or Yale's own VPN app. Setup asks the backend
// every second whether the page answers (keys.page_reachable) and moves on by itself once it does (2026-11-23,
// owner: "if the user is not on Yale VPN you should only show connect to Yale, and check every second if they got
// connected").
import { useEffect, useRef, useState } from 'react'

import { call } from '../../rpc'

export const EVERY_MS = 1000

/** Asks, then again EVERY_MS after each answer (never two questions at once); answers that failed are skipped.
 *  Returns stop. */
export function watchReach(ask: () => Promise<boolean>, onAnswer: (reachable: boolean) => void,
  every = EVERY_MS): () => void {
  let stopped = false
  let timer: ReturnType<typeof setTimeout> | undefined
  const next = () => {
    void ask().then((r) => r, () => null).then((r) => {
      if (stopped) return
      if (r !== null) onAnswer(r)
      timer = setTimeout(next, every)
    })
  }
  next()
  return () => { stopped = true; clearTimeout(timer) }
}

/** Whether the cluster's key page answers, asked every second while on. null: no answer yet. */
export function useKeyPageReach(cluster: string, on: boolean): boolean | null {
  const [reach, setReach] = useState<boolean | null>(null)
  useEffect(() => {
    if (!on) return
    return watchReach(() => call<{ reachable: boolean }>('keys.page_reachable', { cluster }).then((r) => r.reachable),
      setReach)
  }, [cluster, on])
  return reach
}

/** The moment to open the key page by itself: the network just came up (it was seen down before). */
export function cameUp(before: boolean | null, now: boolean): boolean {
  return before === false && now
}

/** Calls fn when on turns true after having been seen false; a first true (already there) isn't a change, and null
 *  (not looking) forgets what was seen. */
export function useCameUp(on: boolean | null, fn: () => void) {
  const before = useRef<boolean | null>(null)
  useEffect(() => {
    if (on !== null && cameUp(before.current, on)) fn()
    before.current = on
  }, [on]) // eslint-disable-line react-hooks/exhaustive-deps
}
