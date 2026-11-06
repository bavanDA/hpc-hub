import { useState } from 'react'

import { Amount } from './Amount'
import { NumberBox } from './NumberBox'
import { Row } from './Row'
import { inRange } from './range'

/** Opens in place as a big input; out of range, the limit turns red and stays under the row. */
export function NumberRow({ label, value, unit, showUnit = true, min = 1, max, note, onChange }: {
  label: string; value: number; unit: string; showUnit?: boolean; min?: number; max?: number | null
  note?: string  // the line under it while the number is fine
  onChange: (n: number) => void
}) {
  const [draft, setDraft] = useState<string | null>(null)
  const ok = inRange(value, min, max)
  const units = (n: number) => `${n} ${n === 1 && unit.endsWith('s') ? unit.slice(0, -1) : unit}`  // 1 core
  const limit = value < min ? `At least ${units(min)}` : max ? `Up to ${units(max)}` : ''
  if (draft !== null) {
    return (
      <div className="flex flex-col gap-2 border-b border-line bg-soft px-5 pt-2.5 pb-3" onBlur={() => setDraft(null)}>
        <div className="flex justify-between gap-3 text-sm text-dim">
          <span>{label}</span><span className={ok ? '' : 'font-semibold text-bad'}>{limit}</span></div>
        <NumberBox label={label} value={draft} unit={unit} bad={!ok} autoFocus
          onChange={(t) => { setDraft(t); onChange(t ? parseInt(t, 10) : 0) }} />
      </div>
    )
  }
  return (
    <Row label={label} sub={ok ? note : <span className="font-semibold text-bad">{limit}</span>}
      onPress={() => setDraft(String(value || ''))}
      value={<span className={ok ? '' : 'text-bad'}><Amount n={value} unit={showUnit ? unit : undefined} /></span>} />
  )
}
