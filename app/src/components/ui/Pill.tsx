import type { ReactNode } from 'react'

import type { Status } from './status'

// ok, warn, bad and dim: older names
type PillKind = Status | 'ok' | 'warn' | 'bad' | 'dim'

const PILL_KIND: Record<PillKind, Status> = {
  success: 'success', info: 'info', warning: 'warning', danger: 'danger', neutral: 'neutral',
  ok: 'success', warn: 'warning', bad: 'danger', dim: 'neutral',
}
const PILL: Record<Status, { box: string; dot: string }> = {
  success: { box: 'text-text', dot: 'bg-text' },
  info: { box: 'text-text', dot: 'bg-dim animate-pulse' },
  warning: { box: 'text-text', dot: 'bg-dim' },
  danger: { box: 'text-bad', dot: 'bg-bad' },
  neutral: { box: 'text-dim', dot: 'border-[1.5px] border-dim' },
}

export function Pill({ kind = 'neutral', dot = true, children, title }:
  { kind?: PillKind; dot?: boolean; children: ReactNode; title?: string }) {
  const look = PILL[PILL_KIND[kind]]
  return (
    <span title={title} className={`inline-flex h-[22px] items-center gap-1.5 whitespace-nowrap text-sm font-medium
      ${look.box}`}>
      {dot && <span aria-hidden className={`size-2 shrink-0 rounded-full ${look.dot}`} />}
      {children}
    </span>
  )
}
