import { useEffect } from 'react'

// newest last: Escape closes only the top one
const open: symbol[] = []

export function useEscape(onClose: () => void) {
  useEffect(() => {
    const me = Symbol('dialog')
    open.push(me)
    const key = (e: KeyboardEvent) => e.key === 'Escape' && open[open.length - 1] === me && onClose()
    window.addEventListener('keydown', key)
    return () => {
      window.removeEventListener('keydown', key)
      open.splice(open.indexOf(me), 1)
    }
  }, [onClose])
}
