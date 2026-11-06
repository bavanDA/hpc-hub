import { useEffect } from 'react'

import { isMac } from '../../app/platform'

/** Ctrl+P, Ctrl+S and Ctrl+F anywhere on the page; the editor handles them itself when it has focus. */
export function usePageKeys(keys: { goTo: () => void; save?: () => void; find?: () => void }) {
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.defaultPrevented || !(isMac ? e.metaKey : e.ctrlKey) || e.altKey) return
      const k = e.key.toLowerCase()
      if (k === 'p') { e.preventDefault(); keys.goTo() }
      if (k === 's' && keys.save) { e.preventDefault(); keys.save() }
      if (k === 'f' && keys.find) { e.preventDefault(); keys.find() }
    }
    window.addEventListener('keydown', key)
    return () => window.removeEventListener('keydown', key)
  })
}
