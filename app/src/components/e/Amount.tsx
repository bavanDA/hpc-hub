import type { ReactNode } from 'react'

export function Amount({ n, unit }: { n: ReactNode; unit?: string }) {
  return <>{n}{unit && <small className="ml-1 text-sm font-normal text-dim">{unit}</small>}</>
}
