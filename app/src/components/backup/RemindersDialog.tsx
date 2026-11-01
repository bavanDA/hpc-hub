// The weekly scratch check: on or off, which day and time, how far ahead to warn. Desktop dialog.
import { useState } from 'react'

import type { Reminders } from '../../types/backup'
import { Button, Dialog, FIELD, Switch } from '../ui'
import { DAYS, reminders as copy } from './copy'

export const HORIZONS = [3, 7, 14]

export function RemindersDialog({ value, onSave, onClose }: {
  value: Reminders | null; onSave: (r: Reminders) => void; onClose: () => void
}) {
  const [r, setR] = useState<Reminders>(value ?? { enabled: true, days: [1], time: '03:00', horizon_days: 7 })
  const day = r.days[0] ?? 1
  return (
    <Dialog title={copy.title} onClose={onClose} actions={<>
      <Button kind="ghost" onClick={onClose}>Cancel</Button>
      <Button kind="primary" onClick={() => onSave(r)}>{copy.save}</Button></>}>
      <div className="flex flex-col gap-4 pt-1">
        <label className="flex items-center gap-3">
          <span className="flex-1"><span className="block">{copy.weekly}</span>
            <span className="text-sm text-dim">{copy.weeklyHint}</span></span>
          <Switch on={r.enabled} onChange={(enabled) => setR({ ...r, enabled })} label={copy.weekly} />
        </label>
        <div className={`flex flex-col gap-4 ${r.enabled ? '' : 'pointer-events-none opacity-45'}`}>
          <div className="flex gap-3">
            <label className="flex flex-1 flex-col gap-1 text-sm text-dim">{copy.day}
              <select className={FIELD} value={day} onChange={(e) => setR({ ...r, days: [Number(e.target.value)] })}>
                {DAYS.map((d, i) => <option key={d} value={i + 1}>{d}</option>)}
              </select>
            </label>
            <label className="flex w-32 flex-col gap-1 text-sm text-dim">{copy.time}
              <input className={FIELD} type="time" value={r.time} onChange={(e) => setR({ ...r, time: e.target.value })} />
            </label>
          </div>
          <p className="text-sm text-dim">{copy.every(DAYS[day - 1], r.time)}</p>
          <label className="flex flex-col gap-1 text-sm text-dim">
            <select className={FIELD} value={r.horizon_days}
              onChange={(e) => setR({ ...r, horizon_days: Number(e.target.value) })}>
              {HORIZONS.map((d) => <option key={d} value={d}>{copy.horizon(d)}</option>)}
            </select>
          </label>
          {value?.next && r.enabled && <p className="text-sm text-dim">{copy.next(new Date(value.next)
            .toLocaleString('en-US', { weekday: 'long', hour: '2-digit', minute: '2-digit' }))}</p>}
        </div>
      </div>
    </Dialog>
  )
}
