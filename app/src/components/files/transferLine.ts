import type { Transfer } from '../../types/files'
import { size } from './format'

export function line(t: Transfer): string {
  if (t.status) return t.status
  return `${size(t.done)} of ${t.total ? size(t.total) : '?'}`
}
