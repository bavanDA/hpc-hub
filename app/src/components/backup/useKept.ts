import { useCallback, useState, type RefObject } from 'react'

import type { Kept, Step } from './flow'

const kept = new Map<string, Kept>()

export const keptFor = (cluster: string): Kept =>
  kept.get(cluster) ?? { step: 'start', scan: '', copy: '', job: '', tried: '' }

/** The cluster's step and ids, kept across visits; ref always holds the latest. */
export function useKept(cluster: string, ref: RefObject<Kept>) {
  const mine = keptFor(cluster)
  const [step, setStepState] = useState<Step>(mine.step)
  const [, bump] = useState(0)  // a change kept outside React (tried, the copy) shows right away
  ref.current = mine

  const save = useCallback((change: Partial<Kept>) => {
    const next = { ...(kept.get(cluster) ?? mine), ...change }
    kept.set(cluster, next)
    ref.current = next
    if (change.step) setStepState(change.step)
    bump((n) => n + 1)
  }, [cluster])  // eslint-disable-line react-hooks/exhaustive-deps -- mine is the first value only
  const setStep = useCallback((s: Step) => save({ step: s }), [save])
  return { step, save, setStep }
}
