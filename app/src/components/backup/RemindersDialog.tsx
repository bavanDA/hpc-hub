import { useState } from 'react'

import type { Reminders } from '../../types/backup'
import { ChoiceRow } from '../e/ChoiceRow'
import { EDialog } from '../e/EDialog'
import { List } from '../e/List'
import { MainButton } from '../e/MainButton'
import { ToggleRow } from '../e/ToggleRow'
import { DAYS, reminders as copy } from './copy'

export const HORIZONS = [3, 7, 14]

export function RemindersDialog({ value, onSave, onClose }: {
  value: Reminders | null; onSave: (r: Reminders) => void; onClose: () => void
}) {
  const [r, setR] = useState<Reminders>(value ?? { enabled: true, days: [1], time: '03:00', horizon_days: 7 })
  const day = r.days[0] ?? 1
  return (
    <EDialog title={copy.title} width={460} onClose={onClose}
      actions={<MainButton onClick={() => onSave(r)}>{copy.save}</MainButton>}>
      <List>
        <ToggleRow label={copy.weekly} sub={copy.weeklyHint} checked={r.enabled}
          onChange={(enabled) => setR({ ...r, enabled })} />
        {r.enabled && <>
          <ChoiceRow label={copy.day} value={String(day)} onChange={(v) => setR({ ...r, days: [Number(v)] })}
            options={DAYS.map((d, i) => ({ value: String(i + 1), label: d }))} />
          <label className="flex min-h-12 items-center gap-3 border-b border-line px-5 py-1.5">
            <span className="flex-1">{copy.time}</span>
            <input type="time" aria-label={copy.time} value={r.time} onChange={(e) => setR({ ...r, time: e.target.value })}
              className="h-9 rounded-lg border border-line-strong bg-window px-2.5 tabular-nums outline-none
                focus:border-accent focus:ring-1 focus:ring-accent" />
          </label>
          <ChoiceRow label="Warn me" value={String(r.horizon_days)}
            onChange={(v) => setR({ ...r, horizon_days: Number(v) })}
            options={HORIZONS.map((d) => ({ value: String(d), label: `${d} days ahead` }))} />
        </>}
      </List>
      {value?.next && r.enabled && <p className="px-5 pt-2 text-sm text-dim">{copy.next(new Date(value.next)
        .toLocaleString('en-US', { weekday: 'long', hour: '2-digit', minute: '2-digit' }))}</p>}
    </EDialog>
  )
}
