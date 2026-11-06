import { EDialog } from './EDialog'
import { Row } from './Row'
import { Tick } from './Tick'

export type Choice<T extends string> = { value: T; label: string; hint?: string }

export function PickDialog<T extends string>({ title, options, value, onPick, onClose }:
  { title: string; options: Choice<T>[]; value?: T; onPick: (v: T) => void; onClose: () => void }) {
  return (
    <EDialog title={title} width={420} onClose={onClose}>
      <div className="border-t border-line">
        {options.map((o) => (
          <Row key={o.value} label={o.label} sub={o.hint} onPress={() => { onClose(); onPick(o.value) }}>
            <Tick on={o.value === value} /></Row>
        ))}
      </div>
    </EDialog>
  )
}
