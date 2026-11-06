import { useState } from 'react'

import { store, stored } from '../pdf/storage'
import { parseLook, START, type Look } from './look'

const KEY = 'reader.look'

/** The Reader's look, remembered; a change of null resets it. */
export function useLook(): [Look, (change: Partial<Look> | null) => void] {
  const [look, setLook] = useState(() => parseLook(stored(KEY, '{}')))
  const change = (c: Partial<Look> | null) => setLook((old) => {
    const next = c ? { ...old, ...c } : START
    store(KEY, JSON.stringify(next))
    return next
  })
  return [look, change]
}
