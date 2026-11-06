import { useEffect, useState } from 'react'

import { call } from '../../rpc'
import type { Opened } from '../../types/latex'
import { inFolder } from './bits'
import { bibKeys } from './issues'

/** Citation keys from the project's .bib files, for completion. */
export function useCites(cluster: string, folder: string, tree: Opened['tree']): string[] {
  const [cites, setCites] = useState<string[]>([])
  useEffect(() => {
    const bibs = tree.filter((e) => e.kind === 'f' && e.path.endsWith('.bib'))
    Promise.all(bibs.map((b) => call<{ text: string }>('latex.read', { cluster, path: inFolder(folder, b.path) })
      .then((r) => bibKeys(r.text)).catch(() => [])))
      .then((keys) => setCites(keys.flat()))
  }, [cluster, folder, tree])
  return cites
}
