import { useEffect, useRef, useState } from 'react'

import { findDraft, keepDrafts } from '../drafts'
import { getFile, type OpenFile } from '../store'
import { onWatch, startWatch } from '../watch'
import type { Banner } from './Banner'

const without = (b: Record<string, Banner>, key: string) => { const { [key]: _, ...rest } = b; return rest }

/** Banners over open files: changed on the cluster or by an agent, deleted, or a draft from an earlier session. */
export function useBanners(files: OpenFile[]) {
  const [banners, setBanners] = useState<Record<string, Banner>>({})

  useEffect(() => {  // drafts and the watcher run while the page is open
    const stopDrafts = keepDrafts()
    const stopWatch = startWatch()
    const stopEvents = onWatch((e) => {
      if (e.kind === 'reloaded') {
        setBanners((b) => without(b, e.key))
        return
      }
      const banner: Banner = e.kind === 'changed' ? { kind: 'changed' } : e.kind === 'deleted' ? { kind: 'deleted' }
        : { kind: 'agent', agent: e.agent, before: e.before }
      setBanners((b) => ({ ...b, [e.key]: banner }))
    })
    return () => { stopDrafts(); stopWatch(); stopEvents() }
  }, [])

  const loadedKeys = files.filter((f) => !f.loading && !f.error).map((f) => f.key).join('\n')
  const checked = useRef(new Set<string>())
  useEffect(() => {
    for (const f of files) {
      if (f.loading || f.error || checked.current.has(f.key)) continue
      checked.current.add(f.key)
      findDraft(f.cluster, f.path).then((d) => {
        const now = getFile(f.key)
        if (!d || !now || d.text === now.text) return
        setBanners((b) => ({ ...b, [f.key]: { kind: 'draft', draft: d, stale: d.base_sha !== now.sha } }))
      }).catch(() => {})
    }
  }, [loadedKeys])  // eslint-disable-line react-hooks/exhaustive-deps

  const dropBanner = (key: string) => setBanners((b) => without(b, key))
  return { banners, dropBanner }
}
