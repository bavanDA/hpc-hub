// A copy that is running or just done, as on the desktop: what, how far, and X (which asks first while it runs).
import { CircleCheck, CircleX, Globe, Smartphone, ArrowRightLeft, X } from 'lucide-react'
import { useState } from 'react'

import { useClusters } from '@shared/components/clusters/store'
import { line } from '@shared/components/files/transferLine'
import type { Transfer } from '@shared/types/files'
import { ConfirmDialog } from '../../ui'
import { withShortNames } from '../code/util'

export function TransferRow({ t, onX, flush = false }: { t: Transfer; onX: (t: Transfer) => void; flush?: boolean }) {
  const { clusters } = useClusters()
  const fraction = t.total ? Math.min(1, t.done / t.total) : 0
  const failed = t.finished && !!t.error
  const Icon = t.finished ? (failed ? CircleX : CircleCheck) : t.how === 'globus' ? Globe
    : t.how === 'laptop' ? Smartphone : ArrowRightLeft
  const cancelling = t.status === 'Cancelling…'
  return (
    <div className={`flex items-center gap-3 py-2.5 ${flush ? '' : 'pr-1 pl-4'}`}>
      <Icon size={18} className={`shrink-0 ${failed ? 'text-bad' : 'text-dim'}`} />
      <div className="min-w-0 flex-1">
        <div className="truncate">{withShortNames(t.title, clusters)}</div>
        <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-pill">
          <div className={`h-full rounded-full transition-[width] duration-300 ${failed ? 'bg-bad' : 'bg-text'} ${
            !t.finished && !t.total ? 'w-1/3 animate-pulse' : ''}`}
            style={t.finished ? { width: '100%' } : t.total ? { width: `${fraction * 100}%` } : undefined} />
        </div>
        <div className="mt-1 truncate text-sm text-dim">{line(t)}</div>
      </div>
      <button type="button" onClick={() => onX(t)} disabled={cancelling} aria-label={t.finished ? 'Remove from list' : 'Cancel'}
        className="grid size-9 shrink-0 place-items-center rounded-md text-dim active:bg-pressed disabled:opacity-40">
        <X size={16} />
      </button>
    </div>
  )
}

/** X on a running copy asks first; on a finished one it just clears the row. */
export function useStopCopy(x: (t: Transfer) => void) {
  const [stop, setStop] = useState<Transfer | null>(null)
  const ask = (t: Transfer) => (t.finished || t.error ? x(t) : setStop(t))
  const dialog = stop && <ConfirmDialog danger keep="Keep copying" confirm="Stop copy"
    title={`Stop copying ${stop.title.split(':')[0]}?`} text="What's copied so far stays where it is."
    onClose={() => setStop(null)} onConfirm={() => x(stop)} />
  return [ask, dialog] as const
}
