import { useEffect, useState } from 'react'

import { getFile, isDirty, reloadFile, type OpenFile } from '../store'

const FOLLOW_EVERY = 3000

/** Logs you follow reload every few seconds and stay at the end. */
export function useFollow(file: OpenFile | null) {
  const [follow, setFollow] = useState<Set<string>>(new Set())

  useEffect(() => {
    if (!file || !follow.has(file.key)) return
    const key = file.key
    const t = window.setInterval(() => {
      const f = getFile(key)
      if (f && !isDirty(f)) void reloadFile(key)
    }, FOLLOW_EVERY)
    return () => clearInterval(t)
  }, [file?.key, follow])  // eslint-disable-line react-hooks/exhaustive-deps

  const add = (key: string) => setFollow((s) => new Set(s).add(key))
  const toggle = (key: string) => setFollow((s) => {
    const n = new Set(s)
    if (n.has(key)) n.delete(key); else n.add(key)
    return n
  })
  return { follow, add, toggle }
}
