// Agents › Running: every agent session on your connected clusters (Claude, ChatGPT, Antigravity, Cursor, Ask all).
// Tap one to open it in Terminals; press and hold (or ⋮) to rename or stop it. Each shows its agent's own logo.
import { Bot } from 'lucide-react'
import { useState } from 'react'

import { shortName } from '@shared/components/clusters/loginCopy'
import { useListings, useLive } from '@shared/components/terminals/data'
import { tabKey } from '@shared/components/terminals/tabKey'
import { openSession } from '@shared/components/terminals/tabs'
import { useTabs } from '@shared/components/terminals/useTabs'
import { Spinner } from '@shared/components/ui'
import { useGo } from '@shared/nav'
import { AGENT_NAMES, type TmuxSession } from '@shared/types/terminals'
import { EmptyState, List } from '../../ui'
import { SessionActions, type Target } from '../terminal/SessionActions'
import { SessionRow } from '../terminal/SessionRow'

export function Running() {
  const live = useLive()
  const { listings, refresh } = useListings(live)
  const { tabs } = useTabs()
  const go = useGo()
  const [acting, setActing] = useState<Target | null>(null)
  const rows: { cluster: string; name: string; s: TmuxSession }[] = []
  for (const c of live) {
    for (const s of listings[c.id]?.listing?.sessions ?? []) {
      if (s.agent && s.agent !== 'term' && AGENT_NAMES[s.agent]) rows.push({ cluster: c.id, name: shortName(c), s })
    }
  }
  const loading = live.some((c) => !listings[c.id])

  if (!live.length) return <EmptyState icon={Bot} title="Not connected"
    text="Connect a cluster to see its agents, or start one with Start agent." />
  return (
    <div>
      {loading && !rows.length && <div className="grid h-40 place-items-center"><Spinner size={24} /></div>}
      {!loading && !rows.length && (
        <div className="h-[50vh]"><EmptyState icon={Bot} title="No agents running"
          text="An agent runs on a compute node and keeps going when you leave the app." /></div>
      )}
      {rows.length > 0 && <List className="mt-2">
        {rows.map(({ cluster, name, s }) => (
          <SessionRow key={`${cluster}/${s.name}`} s={s} extra={live.length > 1 ? name : ''}
            nodes={listings[cluster]?.listing?.nodes ?? null} open={tabs.some((t) => t.key === tabKey(cluster, s.name))}
            onOpen={() => { openSession(cluster, s); go('terminals') }}
            onActions={() => setActing({ cluster, name: s.name, kind: s.kind, node: s.node, title: s.title || s.name, remote: s.remote })} />
        ))}
      </List>}
      {acting && <SessionActions target={acting} onClose={() => setActing(null)} onChanged={refresh} />}
    </div>
  )
}
