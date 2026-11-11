// The desktop's select on a phone: the current choice in a box, and a tap opens the list (a dialog Back closes).
import { useState } from 'react'

import { PickDialog, SelectButton } from '../ui'

export function Choice<T extends string>({ label, value, options, onPick, className }: {
  label: string; value: T; options: readonly (readonly [T, string])[]; onPick: (v: T) => void; className?: string
}) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <SelectButton className={className} label={options.find(([v]) => v === value)?.[1] ?? ''}
        onPress={() => setOpen(true)} />
      {open && <PickDialog title={label} value={value} onPick={onPick} onClose={() => setOpen(false)}
        options={options.map(([v, text]) => ({ value: v, label: text }))} />}
    </>
  )
}
