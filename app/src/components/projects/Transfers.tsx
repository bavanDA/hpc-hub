// The copies started from Projects, with progress and a cancel button.
import { X } from 'lucide-react'
import { useSyncExternalStore } from 'react'

import { call } from '../../rpc'
import { IconButton } from '../ui'
import { getCopies, setCopies, subscribe } from './copies'
import { formatSize } from './size'

export function Transfers() {
  const list = useSyncExternalStore(subscribe, getCopies)
  if (!list.length) return null
  return (
    <section className="flex flex-col gap-2">
      <h3 className="px-1 text-md font-semibold">Copies</h3>
      <div className="divide-y divide-line overflow-hidden rounded-xl bg-card shadow-[var(--shadow-card)]">
        {list.map((t) => {
          const part = t.total ? Math.min(1, t.done / t.total) : 0
          const bytes = t.total > 0 && !t.finished && !t.title.endsWith('Globus')
            ? ` · ${formatSize(t.done)} of ${formatSize(t.total)}` : ''
          return (
            <div key={t.id} className="flex items-center gap-3 py-2.5 pr-2 pl-4">
              <div className="min-w-0 flex-1">
                <div className="truncate text-base" title={t.title}>{t.title}</div>
                <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-pill">
                  <div className={`h-full rounded-full ${t.error ? 'bg-bad' : t.finished ? 'bg-ok' : 'bg-accent'}`}
                    style={{ width: `${(t.finished && !t.error ? 1 : part) * 100}%` }} />
                </div>
                <div className={`mt-1 truncate text-sm ${t.error ? 'text-bad' : 'text-dim'}`}>
                  {t.status}{bytes}</div>
              </div>
              {t.finished
                ? <IconButton icon={X} label="Clear" size={16}
                    onClick={() => setCopies(getCopies().filter((x) => x.id !== t.id))} />
                : <IconButton icon={X} label="Cancel" size={16}
                    onClick={() => call('projects.cancel_copy', { id: t.id }).catch(() => {})} />}
            </div>
          )
        })}
      </div>
    </section>
  )
}
