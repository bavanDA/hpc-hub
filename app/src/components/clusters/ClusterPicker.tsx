import { Check, ChevronDown, Layers } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'

import type { Session } from '../../types'
import { useActiveCluster } from './active'
import { useAllClusters } from './allClusters'
import { SessionDot } from './SessionDot'

function stateText(s?: Session): string {
  if (s?.connected) return s.node ? `Connected · node ${s.node}` : 'Connected'
  if (!s || s.state === 'Disconnected') return 'Not connected'
  return s.state === 'Connected' ? 'VPN only' : s.state
}

export function ClusterPicker() {
  const { clusters, sessions, cluster, setCluster } = useActiveCluster()
  const { all: allPicked, offered, setAll } = useAllClusters()
  const all = offered && allPicked
  const [open, setOpen] = useState(false)
  const [at, setAt] = useState({ left: 0, top: 0 })
  const box = useRef<HTMLDivElement>(null)
  const WIDTH = 260
  const toggle = () => {  // under the button, kept inside the window: a narrow panel never cuts it off
    const r = box.current?.getBoundingClientRect()
    if (r) setAt({ top: r.bottom + 6,
      left: Math.max(8, Math.min(r.left + r.width / 2 - WIDTH / 2, window.innerWidth - WIDTH - 8)) })
    setOpen(!open)
  }
  useEffect(() => {
    if (!open) return
    const away = (e: MouseEvent) => !box.current?.contains(e.target as Node) && setOpen(false)
    const key = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    window.addEventListener('mousedown', away)
    window.addEventListener('keydown', key)
    return () => { window.removeEventListener('mousedown', away); window.removeEventListener('keydown', key) }
  }, [open])
  if (!clusters?.length || !cluster) return null
  const on = clusters.filter((c) => sessions[c.id]?.connected).length
  return (
    <div ref={box} className="relative">
      <button onClick={toggle} aria-haspopup="listbox" aria-expanded={open}
        aria-label={`Cluster: ${all ? 'All clusters' : cluster.name}`} title="Which cluster this page shows"
        className={`flex h-8 items-center gap-2 rounded-md px-2.5 text-sm font-semibold transition-colors ${
          open ? 'bg-selected' : 'bg-control hover:bg-hover'}`}>
        {all ? <Layers size={14} className="shrink-0" /> : <SessionDot session={sessions[cluster.id]} />}
        <span className="max-w-[220px] truncate">{all ? 'All clusters' : cluster.name}</span>
        <ChevronDown size={14} className="text-dim" />
      </button>
      {open && (
        <div role="listbox" aria-label="Clusters" style={{ left: at.left, top: at.top, width: WIDTH }}
          className="menu-in fixed z-50 rounded-xl bg-raised p-1 shadow-[var(--shadow-menu)]">
          {offered && (
            <button role="option" aria-selected={all} onClick={() => { setAll(true); setOpen(false) }}
              className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-left hover:bg-hover">
              <Layers size={14} className="shrink-0" />
              <span className="min-w-0 flex-1">
                <span className="block truncate font-semibold">All clusters</span>
                <span className="block truncate text-sm text-dim">{on} of {clusters.length} connected</span>
              </span>
              {all && <Check size={16} className="text-accent-text" />}
            </button>
          )}
          {clusters.map((c) => (
            <button key={c.id} role="option" aria-selected={!all && c.id === cluster.id}
              onClick={() => { if (offered) setAll(false); setCluster(c.id); setOpen(false) }}
              className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-left hover:bg-hover">
              <SessionDot session={sessions[c.id]} />
              <span className="min-w-0 flex-1">
                <span className="block truncate font-semibold">{c.name}</span>
                <span className="block truncate text-sm text-dim">{stateText(sessions[c.id])}</span>
              </span>
              {!all && c.id === cluster.id && <Check size={16} className="text-accent-text" />}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
