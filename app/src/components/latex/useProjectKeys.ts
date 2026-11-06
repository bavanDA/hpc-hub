import { useEffect, type RefObject } from 'react'

import { useLatest } from '../pdf/useLatest'
import type { EditorHandle } from './editor/CodeEditor'

type Keys = { saveNow: () => void; build: () => void; toPdf: (line: number) => void }

/** Ctrl+S, Ctrl+Enter (or B) and Ctrl+J outside the editor too. */
export function useProjectKeys(keys: Keys, editor: RefObject<EditorHandle | null>) {
  const latest = useLatest(keys)
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.defaultPrevented || !(e.ctrlKey || e.metaKey)) return
      const k = e.key.toLowerCase()
      if (k === 's') { e.preventDefault(); latest.current.saveNow() }
      else if (k === 'enter' || k === 'b') { e.preventDefault(); latest.current.build() }
      else if (k === 'j' && editor.current) { e.preventDefault(); latest.current.toPdf(editor.current.line()) }
    }
    window.addEventListener('keydown', key)
    return () => window.removeEventListener('keydown', key)
  }, [editor, latest])
}
