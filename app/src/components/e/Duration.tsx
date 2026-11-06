import { Amount } from './Amount'
import { dhm } from './range'

export function Duration({ total }: { total: number }) {
  const [d, h, m] = dhm(total)
  const parts = ([[d, d === 1 ? 'day' : 'days'], [h, 'h'], [m, 'min']] as const).filter(([n]) => n > 0)
  if (!parts.length) return <Amount n={0} unit="min" />
  return <>{parts.map(([n, unit], i) => <span key={unit}>{i > 0 && ' '}<Amount n={n} unit={unit} /></span>)}</>
}
