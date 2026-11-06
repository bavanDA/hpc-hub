// The copies started from Projects (the shared store keeps them while you look elsewhere), with progress and a
// button to stop a running one (after Keep copying / Stop copy) or clear a finished one.
import { X } from 'lucide-react'
import { useState, useSyncExternalStore } from 'react'

import { getCopies, setCopies, subscribe } from '@shared/components/projects/copies'
import { size as formatSize } from '@shared/components/files/format'
import { call } from '@shared/rpc'
import { useClusters } from '@shared/components/clusters/store'
import { ConfirmSheet, Section } from '../../ui'
import { withShortNames } from '../code/util'

export function Copies() {
  const list = useSyncExternalStore(subscribe, getCopies)
  const { clusters } = useClusters()
  const [stop, setStop] = useState<(typeof list)[number] | null>(null)
  if (!list.length) return null
  return (
    <Section title="Copies">
        {list.map((t) => {
          const part = t.total ? Math.min(1, t.done / t.total) : 0
          const bytes = t.total > 0 && !t.finished && !t.title.endsWith('Globus')
            ? ` · ${formatSize(t.done)} of ${formatSize(t.total)}` : ''
          return (
            <div key={t.id} className="flex items-center gap-2 border-b border-line py-2 pl-4">
              <div className="min-w-0 flex-1">
                <div className="break-all">{withShortNames(t.title, clusters)}</div>
                {!t.finished && (
                  <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-soft">
                    <div className="h-full rounded-full bg-text" style={{ width: `${part * 100}%` }} />
                  </div>
                )}
                <div className={`mt-1 text-sm ${t.error ? 'text-bad' : 'text-dim'}`}>{t.status}{bytes}</div>
              </div>
              <button aria-label={t.finished ? 'Clear' : 'Stop copy'}
                onClick={() => t.finished ? setCopies(getCopies().filter((x) => x.id !== t.id)) : setStop(t)}
                className="grid size-12 shrink-0 place-items-center rounded-full text-dim active:bg-pressed">
                <X size={20} /></button>
            </div>
          )
        })}
      {stop && <ConfirmSheet danger keep="Keep copying" confirm="Stop copy" title={`Stop copying ${stop.title.split(':')[0]}?`}
        text="What's copied so far stays where it is." onClose={() => setStop(null)}
        onConfirm={() => void call('projects.cancel_copy', { id: stop.id }).catch(() => {})} />}
    </Section>
  )
}
