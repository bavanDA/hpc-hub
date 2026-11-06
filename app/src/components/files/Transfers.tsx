import type { Transfer } from '../../types/files'
import { TransferRow } from './TransferRow'

export function Transfers({ items, onX }: { items: Transfer[]; onX: (t: Transfer) => void }) {
  if (!items.length) return null
  return (
    <div className="max-h-[188px] shrink-0 divide-y divide-line overflow-auto border-y border-line bg-window">
      {items.map((t) => <TransferRow key={t.id} t={t} onX={() => onX(t)} />)}
    </div>
  )
}
