// The header's cluster chip: which cluster this page works on, with each cluster's state. One choice for every page
// (active.ts), so picking SDSC on Jobs still means SDSC on Usage and Files.
import { Check, ChevronDown } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'

import type { Session } from '../../types'
import { statusKind } from '../ui'
import { useActiveCluster } from './active'

const DOT: Record<string, string> = {
  success: 'bg-text', info: 'bg-dim dot-pulse', warning: 'bg-dim', danger: 'bg-bad-dot',
  neutral: 'border-[1.5px] border-dim',
}

export function StatusDot({ session }: { session?: Session }) {
  const kind = session?.connected ? 'success' : statusKind(session?.state ?? 'Disconnected')
  return <span aria-hidden className={`inline-block size-2 shrink-0 rounded-full ${DOT[kind]}`} />
}

function stateText(s?: Session): string {
  if (s?.connected) return s.node ? `Connected · node ${s.node}` : 'Connected'
  if (!s || s.state === 'Disconnected') return 'Not connected'
  return s.state === 'Connected' ? 'VPN only' : s.state
}

export function ClusterPicker() {
  const { clusters, sessions, cluster, setCluster } = useActiveCluster()
  const [open, setOpen] = useState(false)
  const box = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const away = (e: MouseEvent) => !box.current?.contains(e.target as Node) && setOpen(false)
    const key = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    window.addEventListener('mousedown', away)
    window.addEventListener('keydown', key)
    return () => { window.removeEventListener('mousedown', away); window.removeEventListener('keydown', key) }
  }, [open])
  if (!clusters?.length || !cluster) return null
  return (
    <div ref={box} className="relative">
      <button onClick={() => setOpen(!open)} aria-haspopup="listbox" aria-expanded={open}
        aria-label={`Cluster: ${cluster.name}`} title="Which cluster this page shows"
        className={`flex h-8 items-center gap-2 rounded-md px-2.5 text-sm font-semibold transition-colors ${
          open ? 'bg-selected' : 'bg-control hover:bg-hover'}`}>
        <StatusDot session={sessions[cluster.id]} />
        <span className="max-w-[220px] truncate">{cluster.name}</span>
        <ChevronDown size={14} className="text-dim" />
      </button>
      {open && (
        <div role="listbox" aria-label="Clusters" className="menu-in absolute top-full left-1/2 z-30 mt-1.5 min-w-[260px]
          -translate-x-1/2 rounded-xl bg-raised p-1 shadow-[var(--shadow-menu)]">
          {clusters.map((c) => (
            <button key={c.id} role="option" aria-selected={c.id === cluster.id}
              onClick={() => { setCluster(c.id); setOpen(false) }}
              className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-left hover:bg-hover">
              <StatusDot session={sessions[c.id]} />
              <span className="min-w-0 flex-1">
                <span className="block truncate font-semibold">{c.name}</span>
                <span className="block truncate text-sm text-dim">{stateText(sessions[c.id])}</span>
              </span>
              {c.id === cluster.id && <Check size={16} className="text-accent-text" />}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
