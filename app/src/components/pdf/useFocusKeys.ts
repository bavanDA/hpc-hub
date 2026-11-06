import { useEffect } from 'react'

import { useLatest } from './useLatest'

const typing = (t: EventTarget | null) => !!(t as HTMLElement | null)?.closest?.('input, textarea, select, [contenteditable]')

/** F turns focus on from inside the viewer; while on, F and Esc anywhere turn it off (before a dialog's Esc). */
export function useFocusKeys(on: boolean, set: (on: boolean) => void) {
  const toggle = (e: React.KeyboardEvent) => {
    if (on || e.ctrlKey || e.metaKey || e.altKey || typing(e.target) || e.key.toLowerCase() !== 'f') return
    e.preventDefault()
    set(true)
  }
  const latest = useLatest(set)
  useEffect(() => {
    if (!on) return
    const key = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey || typing(e.target)) return
      if (e.key === 'Escape' || e.key.toLowerCase() === 'f') {
        e.preventDefault()
        e.stopPropagation()
        latest.current(false)
      }
    }
    window.addEventListener('keydown', key, true)
    return () => window.removeEventListener('keydown', key, true)
  }, [on, latest])
  return toggle
}
