// Copies between clusters, with progress. The X cancels one that runs and takes a finished one off the list.
import { ArrowRightLeft, CircleCheck, CircleX, Globe, Laptop, X } from 'lucide-react'

import type { Transfer } from '../../types/files'
import { size } from './format'

function line(t: Transfer): string {
  if (t.status) return t.status
  return `${size(t.done)} of ${t.total ? size(t.total) : '?'}`
}

export function Transfers({ items, onX }: { items: Transfer[]; onX: (t: Transfer) => void }) {
  if (!items.length) return null
  return (
    <div className="max-h-[188px] shrink-0 overflow-auto border-t border-line bg-window px-3 py-2">
      <div className="divide-y divide-line overflow-hidden rounded-xl bg-card shadow-[var(--shadow-card)]">
        {items.map((t) => <Row key={t.id} t={t} onX={() => onX(t)} />)}
      </div>
    </div>
  )
}

function Row({ t, onX }: { t: Transfer; onX: () => void }) {
  const fraction = t.total ? Math.min(1, t.done / t.total) : 0
  const failed = t.finished && !!t.error
  const Icon = t.finished ? (failed ? CircleX : CircleCheck) : t.how === 'globus' ? Globe
    : t.how === 'laptop' ? Laptop : ArrowRightLeft
  const cancelling = t.status === 'Cancelling…'
  return (
    <div className="flex items-center gap-3 px-3 py-2">
      <Icon size={20} className={`shrink-0 ${failed ? 'text-bad' : 'text-dim'}`} />
      <div className="min-w-0 flex-1">
        <div className="truncate text-base" title={t.title}>{t.title}</div>
        <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-pill">
          <div className={`h-full rounded-full transition-[width] duration-300 ${
            failed ? 'bg-bad' : 'bg-text'} ${
            !t.finished && !t.total ? 'w-1/3 animate-pulse' : ''}`}
            style={t.finished ? { width: '100%' } : t.total ? { width: `${fraction * 100}%` } : undefined} />
        </div>
        <div className="mt-1 truncate text-xs text-dim">{line(t)}</div>
      </div>
      <button onClick={onX} disabled={cancelling} title={t.finished ? 'Remove from list' : 'Cancel'}
        aria-label={t.finished ? 'Remove from list' : 'Cancel'}
        className="grid size-8 shrink-0 place-items-center rounded-full hover:bg-hover disabled:opacity-40">
        <X size={16} />
      </button>
    </div>
  )
}
