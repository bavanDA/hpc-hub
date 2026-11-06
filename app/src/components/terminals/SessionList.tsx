import { PanelLeftClose, Plus, RefreshCw } from 'lucide-react'

import { IconButton } from '../ui/IconButton'
import { ClusterSessions } from './ClusterSessions'
import type { Listed, Live } from './data'
import { ListNote } from './ListNote'
import { PanelHead } from './PanelHead'
import type { Tab } from './tabs'

export function SessionList({ live, listings, tabs, current, onRefresh, onNew, onHide }: {
  live: Live[]; listings: Record<string, Listed>; tabs: Tab[]; current: string | null
  onRefresh: () => void; onNew: () => void; onHide?: () => void
}) {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <PanelHead title="Sessions">
        <IconButton icon={RefreshCw} label="Refresh" size={16} onClick={onRefresh} />
        <IconButton icon={Plus} label="New terminal" onClick={onNew} />
        {onHide && <IconButton icon={PanelLeftClose} label="Hide sessions" onClick={onHide} />}
      </PanelHead>
      <div className="min-h-0 flex-1 overflow-auto pb-2">
        {!live.length && <ListNote>Connect a cluster to see its sessions.</ListNote>}
        {live.map((c) => (
          <ClusterSessions key={c.id} cluster={c} listed={listings[c.id]} tabs={tabs} current={current}
            onRefresh={onRefresh} />
        ))}
      </div>
      <p className="px-4 pb-3 text-sm text-dim">
        Sessions keep running when you close a tab.
      </p>
    </div>
  )
}
