import { X } from 'lucide-react'

import { useToast } from '../useToast'
import { SessionIcon } from './Popover'
import { SessionMenu } from './SessionMenu'
import { close, select, type Tab } from './tabs'

export function TabStrip({ tabs, current, onChanged }:
  { tabs: Tab[]; current: string | null; onChanged: () => void }) {
  const toast = useToast()
  const tab = tabs.find((t) => t.key === current)
  // closing a session's tab only hides it: say so, so nobody thinks the work was stopped
  const shut = (t: Tab) => {
    close(t.key)
    if (t.session && !t.ended) toast(`${t.title} is still running. Reopen it from Sessions.`)
  }
  return (
    <div className="flex h-11 shrink-0 items-center gap-1 border-b border-line pr-2">
      <div className="flex h-full min-w-0 flex-1 overflow-x-auto">
        {tabs.map((t) => (
          <div key={t.key} onClick={() => select(t.key)} title={t.session || t.title}
            className={`flex h-full max-w-[220px] min-w-[120px] shrink-0 items-center gap-2 border-b-2 pr-1 pl-3 ${
              t.key === current ? 'border-accent font-semibold' : 'border-transparent text-dim hover:bg-hover'}`}>
            <SessionIcon session={t.session} />
            <span className={`min-w-0 flex-1 truncate ${t.ended ? 'text-dim' : ''}`}>{t.title}</span>
            <button aria-label="Close" title={t.session ? 'Close (keeps running)' : 'Close'}
              onClick={(e) => { e.stopPropagation(); shut(t) }}
              className="grid size-6 shrink-0 place-items-center rounded text-dim hover:bg-hover hover:text-text">
              <X size={14} /></button>
          </div>
        ))}
      </div>
      {tab?.session && (
        <SessionMenu key={tab.key} onChanged={onChanged}
          target={{ cluster: tab.cluster, name: tab.session, kind: tab.kind, node: tab.node, title: tab.title }} />
      )}
    </div>
  )
}
