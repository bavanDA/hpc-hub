import { useState } from 'react'

import { n } from './format'
import { day, weekEnds } from './pace'

const W = 240
const H = 44
const iso = (d: Date) => `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`

export function Weeks({ weeks }: { weeks: number[] }) {
  const [at, setAt] = useState<number | null>(null)
  const top = Math.max(...weeks, 1) * 1.1
  const x = (i: number) => (i * W) / (weeks.length - 1)
  const y = (v: number) => H - 1 - ((H - 4) * v) / top
  const line = weeks.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ')
  const ends = weekEnds(weeks.length)
  const first = (i: number) => { const d = new Date(ends[i]); d.setDate(d.getDate() - 6); return d }
  return (
    <div>
      <div className="mb-1 truncate text-xs text-dim tabular-nums">
        {at == null ? 'SUs per week, last 12 weeks'
          : `${day(iso(first(at)))} to ${day(iso(ends[at]))}: ${n(weeks[at])} SUs`}
      </div>
      <div className="relative h-11" onMouseLeave={() => setAt(null)}>
        <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="block h-11 w-full" aria-hidden>
          <polygon points={`0,${H} ${line} ${W},${H}`} className="fill-soft" />
          <polyline points={line} fill="none" className="stroke-text" strokeWidth={1.6}
            vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
          {at != null && <line x1={x(at)} x2={x(at)} y1={0} y2={H} className="stroke-line-strong"
            vectorEffect="non-scaling-stroke" />}
        </svg>
        {at != null && <span className="pointer-events-none absolute size-2 -translate-1/2 rounded-full bg-text
          ring-2 ring-window" style={{ left: `${(100 * at) / (weeks.length - 1)}%`, top: y(weeks[at]) }} />}
        <div className="absolute inset-0 flex">
          {weeks.map((v, i) => <span key={i} className="h-full flex-1" onMouseEnter={() => setAt(i)}
            aria-label={`${day(iso(ends[i]))}: ${n(v)} SUs`} />)}
        </div>
      </div>
    </div>
  )
}
