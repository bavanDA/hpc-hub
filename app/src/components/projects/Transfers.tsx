// The copies started from Projects, under the table: one line each with a bar, how far it is, and Stop (after Keep
// copying / Stop copy) for a running one or Clear for a finished one.
import { RefreshCw } from 'lucide-react'
import { useState, useSyncExternalStore } from 'react'

import { call } from '../../rpc'
import { Confirm, EButton } from '../e/extra'
import { getCopies, setCopies, subscribe } from './copies'
import { formatSize } from './size'

export function Transfers() {
  const list = useSyncExternalStore(subscribe, getCopies)
  const [stop, setStop] = useState<(typeof list)[number] | null>(null)
  if (!list.length) return null
  return (
    <section className="mt-8">
      <h2 className="px-3 pb-2 text-sm font-semibold text-dim">Copies</h2>
      <div className="border-t border-line">
        {list.map((t) => {
          const part = t.total ? Math.min(1, t.done / t.total) : 0
          const globus = t.title.endsWith('Globus')
          const line = t.finished || !t.total ? t.status : [t.status, `${Math.floor(part * 100)}%`,
            ...globus ? [] : [`${formatSize(t.done)} of ${formatSize(t.total)}`]].join(' · ')
          return (
            <div key={t.id} className="flex min-h-13 flex-wrap items-center gap-x-4 gap-y-1 border-b border-line py-2
              pr-2 pl-3">
              <RefreshCw size={16} className="shrink-0 text-dim" />
              <div className="min-w-[160px] flex-1 [overflow-wrap:anywhere]" title={t.title}>{t.title}</div>
              {!t.finished && (
                <div className="h-1 w-[200px] overflow-hidden rounded-full bg-line @max-[640px]:hidden">
                  <div className="h-full rounded-full bg-text" style={{ width: `${part * 100}%` }} />
                </div>
              )}
              <div className={`text-sm whitespace-nowrap ${t.error ? 'text-bad' : 'text-dim'}`}>{line}</div>
              <EButton small onClick={() => t.finished
                ? setCopies(getCopies().filter((x) => x.id !== t.id)) : setStop(t)}>
                {t.finished ? 'Clear' : 'Stop'}</EButton>
            </div>
          )
        })}
      </div>
      {stop && <Confirm title="Stop this copy?" keep="Keep copying" act="Stop copy"
        onClose={() => setStop(null)} onAct={() => {
          setStop(null)
          void call('projects.cancel_copy', { id: stop.id }).catch(() => {})
        }}><p>{stop.title}. What's copied so far stays where it is.</p></Confirm>}
    </section>
  )
}
