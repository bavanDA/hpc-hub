// The open terminals as tabs, with the current session's menu at the end.
import { X } from 'lucide-react'

import { useToast } from '../toast'
import { Dot } from './Popover'
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
    <div className="flex h-12 shrink-0 items-center gap-1 border-b border-line px-2">
      <div className="flex min-w-0 flex-1 gap-1 overflow-x-auto">
        {tabs.map((t) => (
          <div key={t.key} onClick={() => select(t.key)} title={t.session || t.title}
            className={`flex h-9 max-w-[220px] min-w-[120px] shrink-0 items-center gap-2 rounded-md pr-1 pl-3 ${
              t.key === current ? 'bg-selected' : 'hover:bg-hover'}`}>
            <Dot color={t.color} />
            <span className={`min-w-0 flex-1 truncate ${t.ended ? 'text-dim' : ''}`}>{t.title}</span>
            <button aria-label="Close" title={t.session ? 'Close (keeps running)' : 'Close'}
              onClick={(e) => { e.stopPropagation(); shut(t) }}
              className="grid size-6 shrink-0 place-items-center rounded-full hover:bg-hover"><X size={14} /></button>
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
