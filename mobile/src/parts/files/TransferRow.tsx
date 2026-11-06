// One copy between clusters (or to and from this phone): what, how far, and X to stop it or clear it.
import { Check, CircleAlert, X } from 'lucide-react'

import { size } from '@shared/components/files/format'
import { Spinner } from '@shared/components/ui/Spinner'
import { useClusters } from '@shared/components/clusters/store'
import type { Transfer } from '@shared/types/files'
import { withShortNames, wrapPath } from '../code/util'

/** "climate-model: Wulver (NJIT) → Yale Bouchet:/home/jdoe" as the name and where it goes. */
export function parts(title: string): { name: string; route: string } {
  const at = title.indexOf(': ')
  return at < 0 ? { name: title, route: '' } : { name: title.slice(0, at), route: title.slice(at + 2) }
}

function line(t: Transfer): string {
  if (t.error) return t.error === 'Cancelled' ? 'Cancelled' : `Failed: ${t.error}`
  if (t.status) return t.status
  if (t.how === 'globus') return t.total ? `${t.done} of ${t.total} files` : 'Counting files'
  return t.total ? `${size(t.done)} of ${size(t.total)}` : 'Starting'
}

export function TransferRow({ t, onX }: { t: Transfer; onX: (t: Transfer) => void }) {
  const { clusters } = useClusters()
  const { name, route } = parts(t.title)
  const how = t.how === 'globus' ? 'Globus' : t.how === 'cluster' ? 'On the cluster' : 'Through this phone'
  const ratio = t.total ? Math.min(1, t.done / t.total) : 0
  return (
    <div className="flex items-start gap-3 border-b border-line py-3 pl-4">
      <span className="mt-0.5 grid size-6 shrink-0 place-items-center">
        {t.error ? <CircleAlert size={20} className="text-bad" />
          : t.finished ? <Check size={20} className="text-dim" /> : <Spinner size={18} />}
      </span>
      <div className="min-w-0 flex-1">
        <p className="font-semibold break-all">{name}</p>
        {route && <p className="text-sm break-words text-dim">
          {wrapPath(withShortNames(route.replace(/ · Globus$/, ''), clusters))}</p>}
        {!t.finished && !t.error && t.total > 0 && (
          <div role="progressbar" aria-valuenow={Math.round(ratio * 100)} className="mt-2 h-1.5 overflow-hidden
            rounded-full bg-soft"><div className="h-full rounded-full bg-text" style={{ width: `${ratio * 100}%` }} />
          </div>
        )}
        <p className={`mt-1 text-sm ${t.error ? 'text-bad' : 'text-dim'}`}>{how} · {line(t)}</p>
      </div>
      <button aria-label={t.finished ? 'Clear' : 'Stop copy'} onClick={() => onX(t)}
        className="grid size-12 shrink-0 place-items-center rounded-full text-dim active:bg-pressed">
        <X size={20} /></button>
    </div>
  )
}
