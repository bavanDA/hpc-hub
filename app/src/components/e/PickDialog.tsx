import type { ReactNode } from 'react'

import { EDialog } from './EDialog'
import { Row } from './Row'
import { Tick } from './Tick'

export type Choice<T extends string> = { value: T; label: string; hint?: string }

export function PickDialog<T extends string>({ title, options, value, onPick, onClose, width = 420, top }:
  { title: string; options: Choice<T>[]; value?: T; onPick: (v: T) => void; onClose: () => void; width?: number
    top?: ReactNode }) {
  return (
    <EDialog title={title} width={width} onClose={onClose}>
      {top && <div className="flex justify-end px-5 pb-2">{top}</div>}
      <div className="border-t border-line">
        {options.map((o) => (
          <Row key={o.value} label={o.label} sub={o.hint} onPress={() => { onClose(); onPick(o.value) }}>
            <Tick on={o.value === value} /></Row>
        ))}
      </div>
    </EDialog>
  )
}
