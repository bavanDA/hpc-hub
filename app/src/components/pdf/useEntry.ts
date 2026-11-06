import { useEffect, useState } from 'react'

import { lookUp, type Entry } from './lookUp'

/** The word's entry: null while it loads. */
export function useEntry(text: string) {
  const [entry, setEntry] = useState<Entry | null>(null)
  useEffect(() => {
    let live = true
    lookUp(text).then((e) => live && setEntry(e))
      .catch((e: Error) => live && setEntry({ word: text, error: e.message, offline: false }))
    return () => { live = false }
  }, [text])
  return entry
}
