import type { ReactNode } from 'react'

import { Pill } from './Pill'
import { statusKind } from './status'

export function StatusPill({ state, children }: { state: string; children?: ReactNode }) {
  return <Pill kind={statusKind(state)}>{children ?? state}</Pill>
}
