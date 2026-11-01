// The copies started from Projects (the shared store keeps them while you look elsewhere), with progress and a
// button to cancel a running one or clear a finished one.
import { X } from 'lucide-react'
import { useSyncExternalStore } from 'react'

import { getCopies, setCopies, subscribe } from '@shared/components/projects/copies'
import { formatSize } from '@shared/components/projects/size'
import { call } from '@shared/rpc'
import { Card } from '../../ui'

export function Copies() {
  const list = useSyncExternalStore(subscribe, getCopies)
  if (!list.length) return null
  return (
    <section className="mt-6">
      <h2 className="mb-2 text-sm font-bold text-dim">Copies</h2>
      <Card className="divide-y divide-line py-1">
        {list.map((t) => {
          const part = t.total ? Math.min(1, t.done / t.total) : 0
          const bytes = t.total > 0 && !t.finished && !t.title.endsWith('Globus')
            ? ` · ${formatSize(t.done)} of ${formatSize(t.total)}` : ''
          return (
            <div key={t.id} className="flex items-center gap-2 py-2">
              <div className="min-w-0 flex-1">
                <div className="truncate">{t.title}</div>
                <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-pill">
                  <div className={`h-full rounded-full ${t.error ? 'bg-bad' : t.finished ? 'bg-ok' : 'bg-accent'}`}
                    style={{ width: `${(t.finished && !t.error ? 1 : part) * 100}%` }} />
                </div>
                <div className={`mt-1 truncate text-sm ${t.error ? 'text-bad' : 'text-dim'}`}>{t.status}{bytes}</div>
              </div>
              <button aria-label={t.finished ? 'Clear' : 'Cancel copy'}
                onClick={() => t.finished ? setCopies(getCopies().filter((x) => x.id !== t.id))
                  : call('projects.cancel_copy', { id: t.id }).catch(() => {})}
                className="grid size-11 shrink-0 place-items-center rounded-full text-dim active:bg-hover">
                <X size={20} /></button>
            </div>
          )
        })}
      </Card>
    </section>
  )
}
