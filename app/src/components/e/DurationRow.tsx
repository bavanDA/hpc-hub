import { useState } from 'react'

import { human } from '../clusters/time'
import { Duration } from './Duration'
import { NumberBox } from './NumberBox'
import { Row } from './Row'
import { dhm, inRange } from './range'

/** max: the longest allowed, in minutes. */
export function DurationRow({ label, minutes: total, max, onChange }:
  { label: string; minutes: number; max?: number | null; onChange: (m: number) => void }) {
  const [draft, setDraft] = useState<[string, string, string] | null>(null)
  const ok = inRange(total, 1, max)
  const limit = total < 1 ? 'At least 1 min' : max ? `Up to ${human(max)}` : ''
  if (draft !== null) {
    const set = (i: number, t: string) => {
      const next = [...draft] as [string, string, string]
      next[i] = t
      setDraft(next)
      const [d, h, m] = next.map((x) => parseInt(x || '0', 10))
      onChange(d * 1440 + h * 60 + m)
    }
    return (
      <div className="flex flex-col gap-2 border-b border-line bg-soft px-5 pt-2.5 pb-3"
        onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setDraft(null) }}>
        <div className="flex justify-between gap-3 text-sm text-dim">
          <span>{label}</span><span className={ok ? '' : 'font-semibold text-bad'}>{limit}</span></div>
        <div className="flex gap-2">
          <NumberBox inline label="Days" value={draft[0]} unit="d" bad={!ok} onChange={(t) => set(0, t)} />
          <NumberBox inline label="Hours" value={draft[1]} unit="h" bad={!ok} autoFocus onChange={(t) => set(1, t)} />
          <NumberBox inline label="Minutes" value={draft[2]} unit="min" bad={!ok} onChange={(t) => set(2, t)} />
        </div>
      </div>
    )
  }
  const open = () => setDraft(dhm(total).map(String) as [string, string, string])
  return (
    <Row label={label} sub={!ok && <span className="font-semibold text-bad">{limit}</span>} onPress={open}
      value={<span className={ok ? '' : 'text-bad'}><Duration total={total} /></span>} />
  )
}
