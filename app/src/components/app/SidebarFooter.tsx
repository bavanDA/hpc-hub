// The bottom of the sidebar: each cluster you're connected to (or connecting), its node and the time left, so
// "where am I and for how long" shows on every page but Clusters, whose cards say it. Click one to see its card.
// Then Settings.
import { Settings } from 'lucide-react'
import { useEffect, useState } from 'react'

import type { Cluster, Session } from '../../types/clusters'
import { BUSY } from '../../types/clusters'
import { setActiveCluster } from '../clusters/active'
import { shortName } from '../clusters/loginCopy'
import { StatusDot } from '../clusters/ClusterPicker'
import { load, useClusters } from '../clusters/store'
import type { Page } from '../Sidebar'
import { leftText, useTimeLeft } from './watch'

function Line({ c, s, onPick }: { c: Cluster; s: Session; onPick: (p: Page) => void }) {
  const left = useTimeLeft(c.id, s.job ?? '')
  const what = !s.connected ? (s.state === 'Connected' ? 'VPN only' : s.state)
    : s.node ? [s.node, left !== null && leftText(left)].filter(Boolean).join(' · ') : 'no node'
  return (
    <button onClick={() => { setActiveCluster(c.id); onPick('clusters') }} title={`${c.name}: ${what}`}
      className="flex w-full items-center gap-2.5 rounded-md px-3 py-1.5 text-left hover:bg-hover">
      <StatusDot session={s} />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-semibold">{shortName(c)}</span>
        <span className={`block truncate text-xs ${left !== null && left <= 15 * 60 ? 'font-semibold text-text' : 'text-dim'}`}>
          {what}</span>
      </span>
    </button>
  )
}

export function SidebarFooter({ page, onPick, onSettings }:
  { page?: Page; onPick: (p: Page) => void; onSettings: () => void }) {
  const { clusters, sessions } = useClusters()
  const [, tick] = useState(0)
  useEffect(load, [])
  useEffect(() => {  // the time left counts down between looks
    const t = setInterval(() => tick((n) => n + 1), 30_000)
    return () => clearInterval(t)
  }, [])
  const shown = (clusters ?? []).filter((c) => {
    const s = sessions[c.id]
    return s && (s.connected || s.state === 'Connected' || BUSY.includes(s.state))
  })
  return (
    <div className="shrink-0 border-t border-line px-1.5 py-2">
      {page !== 'clusters' && <>
        {shown.map((c) => <Line key={c.id} c={c} s={sessions[c.id]} onPick={onPick} />)}
        {!shown.length && <p className="px-3 py-1.5 text-xs text-dim">No cluster connected</p>}
      </>}
      <button onClick={onSettings}
        className="mt-1 flex h-9 w-full items-center gap-3 rounded-md px-3 text-left hover:bg-hover active:bg-pressed">
        <Settings size={16} className="text-dim" />
        <span>Settings</span>
      </button>
    </div>
  )
}
