import { useEffect, useState } from 'react'

/** Seconds since from (a Date.now() time), ticking. */
export function Seconds({ from }: { from: number }) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t) }, [])
  return <span className="tabular-nums">{Math.max(0, Math.floor((now - from) / 1000))} s</span>
}
