import { useState, type ReactNode } from 'react'

import { type Choice, PickDialog } from './PickDialog'
import { Row } from './Row'

export function ChoiceRow<T extends string>({ label, sub, value, options, onChange }:
  { label: string; sub?: ReactNode; value: T; options: Choice<T>[]; onChange: (v: T) => void }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <Row label={label} sub={sub} value={options.find((o) => o.value === value)?.label ?? 'Default'} opens
        onPress={() => setOpen(true)} />
      {open && <PickDialog title={label} options={options} value={value} onPick={onChange}
        onClose={() => setOpen(false)} />}
    </>
  )
}
