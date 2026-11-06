import { Transfers } from './Transfers'
import { useTransfers } from './useTransfers'

/** Copies that went through this laptop; Globus copies are in Globus's own list below. */
export function LaptopCopies() {
  const transfers = useTransfers(() => {})
  const items = transfers.items.filter((t) => t.how !== 'globus')
  if (!items.length) return null
  return (
    <section className="px-4 pt-4">
      <h2 className="mb-1.5 text-xs font-semibold tracking-wide text-dim uppercase">Through this laptop</h2>
      <Transfers items={items} onX={transfers.x} />
    </section>
  )
}
