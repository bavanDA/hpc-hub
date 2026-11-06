import { useEffect, useRef } from 'react'

/** Closes a popover on a click outside it (but not on the buttons that open one) or on Escape. */
export function useOutside(onClose: () => void) {
  const box = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const down = (e: MouseEvent) => {
      const t = e.target as HTMLElement
      if (!box.current?.contains(t) && !t.closest?.('[aria-label="Reading settings"], [aria-expanded]')) onClose()
    }
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); onClose() } }
    window.addEventListener('mousedown', down)
    window.addEventListener('keydown', key, true)
    return () => { window.removeEventListener('mousedown', down); window.removeEventListener('keydown', key, true) }
  }, [onClose])
  return box
}
