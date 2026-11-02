// The copies started from Projects, with progress and a button to stop a running one (after Keep copying / Stop
// copy) or clear a finished one. Style E rows, like the phone's Copies.
import { X } from 'lucide-react'
import { useState, useSyncExternalStore } from 'react'

import { call } from '../../rpc'
import { Confirm, IconBtn } from '../e/extra'
import { Section } from '../e/ui'
import { getCopies, setCopies, subscribe } from './copies'
import { formatSize } from './size'

export function Transfers() {
  const list = useSyncExternalStore(subscribe, getCopies)
  const [stop, setStop] = useState<(typeof list)[number] | null>(null)
  if (!list.length) return null
  return (
    <Section title="Copies">
      {list.map((t) => {
        const part = t.total ? Math.min(1, t.done / t.total) : 0
        const bytes = t.total > 0 && !t.finished && !t.title.endsWith('Globus')
          ? ` · ${formatSize(t.done)} of ${formatSize(t.total)}` : ''
        return (
          <div key={t.id} className="flex items-center gap-2 border-b border-line py-2 pr-3 pl-5">
            <div className="min-w-0 flex-1">
              <div className="break-all" title={t.title}>{t.title}</div>
              {!t.finished && (
                <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-soft">
                  <div className="h-full rounded-full bg-text" style={{ width: `${part * 100}%` }} />
                </div>
              )}
              <div className={`mt-1 text-sm ${t.error ? 'text-bad' : 'text-dim'}`}>{t.status}{bytes}</div>
            </div>
            <IconBtn icon={X} label={t.finished ? 'Clear' : 'Stop copy'}
              onClick={() => t.finished ? setCopies(getCopies().filter((x) => x.id !== t.id)) : setStop(t)} />
          </div>
        )
      })}
      {stop && <Confirm title="Stop this copy?" keep="Keep copying" act="Stop copy"
        onClose={() => setStop(null)} onAct={() => {
          setStop(null)
          void call('projects.cancel_copy', { id: stop.id }).catch(() => {})
        }}><p>{stop.title}. What's copied so far stays where it is.</p></Confirm>}
    </Section>
  )
}
