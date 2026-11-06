import { useEffect, useState } from 'react'

/** Seconds counting up while something runs. */
export function useSeconds(running: boolean): number {
  const [s, setS] = useState(0)
  useEffect(() => {
    if (!running) return
    const t0 = Date.now()
    const t = setInterval(() => setS(Math.floor((Date.now() - t0) / 1000)), 500)
    return () => { clearInterval(t); setS(0) }
  }, [running])
  return s
}
