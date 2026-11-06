import { useCallback, useEffect, useRef, useState } from 'react'

import { call } from '../../rpc'
import { useLatest } from '../pdf/useLatest'
import { useToast } from '../useToast'

export type Doc = { path: string; text: string; version: number; line?: number }

/** The file open in the editor: read, edited text and save. */
export function useDoc(cluster: string, first: string) {
  const toast = useToast()
  const [doc, setDoc] = useState<Doc | null>(null)
  const [error, setError] = useState('')
  const [dirty, setDirty] = useState(false)
  const [saving, setSaving] = useState(false)
  const text = useRef('')
  const docRef = useLatest(doc)

  const read = useCallback((path: string, line?: number) => {
    call<{ text: string }>('latex.read', { cluster, path })
      .then(({ text: t }) => {
        text.current = t
        setDoc((d) => ({ path, text: t, version: (d?.version ?? 0) + 1, line }))
        setDirty(false)
      })
      .catch((e: Error) => { setError(e.message); setDoc(null) })
  }, [cluster])
  const load = useCallback((path: string, line?: number) => { setError(''); read(path, line) }, [read])

  const save = useCallback(async (): Promise<boolean> => {
    const d = docRef.current
    if (!d || !dirty) return true
    setSaving(true)
    try {
      await call('latex.write', { cluster, path: d.path, text: text.current })
      setDirty(false)
      return true
    } catch (e) {
      toast(`Could not save: ${(e as Error).message}`)
      return false
    } finally { setSaving(false) }
  }, [cluster, dirty, toast, docRef])

  useEffect(() => { read(first) }, [read, first])  // no error to clear yet

  const edit = (t: string) => { text.current = t; if (!dirty) setDirty(true) }

  return { doc, setDoc, docRef, error, dirty, saving, load, save, edit }
}
