// The editor's language for a path, as a stable array, for diffs (Diff wants extensions that don't change). The first
// call starts loading it and answers []; once loaded, the same array comes back every time.
import type { Extension } from '@codemirror/state'
import { useEffect, useState } from 'react'

import { detect, loadLanguage } from '../languages'

const cache = new Map<string, Extension[]>()
const waiting = new Map<string, Promise<void>>()
const subs = new Set<() => void>()
const NONE: Extension[] = []

export function languageFor(path: string): Extension[] {
  const id = detect(path).id
  const got = cache.get(id)
  if (got) return got
  if (!waiting.has(id)) {
    waiting.set(id, loadLanguage(id).then((ext) => {
      cache.set(id, [ext])
      subs.forEach((fn) => fn())
    }).catch(() => { cache.set(id, NONE) }))
  }
  return NONE
}

/** Redraws when a language finishes loading, so diffs get their colors. */
export function useLanguages() {
  const [, bump] = useState(0)
  useEffect(() => {
    const fn = () => bump((n) => n + 1)
    subs.add(fn)
    return () => { subs.delete(fn) }
  }, [])
}
