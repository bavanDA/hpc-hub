// One card per cluster, laid out like the GTK app's: status, connect, compute node, log.
import { ChevronDown, ChevronRight, LayoutGrid, Server, Settings } from 'lucide-react'
import { useState } from 'react'

import type { Cluster, Session } from '../types'

const PILL: Record<string, string> = {
  Connected: 'bg-ok-bg text-ok', Error: 'bg-bad-bg text-bad', Disconnected: 'bg-pill text-dim',
}

function summary(c: Cluster) {
  const p = c.profile
  return `${p.cpus} cores · ${p.mem_gb} GB · ${p.time} · ${p.partition}`
}

export function ClusterCard({ cluster: c, session: s }: { cluster: Cluster; session: Session }) {
  const [log, setLog] = useState(false)
  const connected = s.state === 'Connected'
  const idle = s.state === 'Disconnected' || s.state === 'Error'
  return (
    <section className="flex flex-col gap-3 rounded-xl bg-card p-4 shadow-[var(--shadow-card)]">
      <div className="flex items-center gap-3">
        <Server size={32} strokeWidth={1.5} className="shrink-0" />
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-xl font-bold leading-tight">{c.name}</h2>
          <p className="truncate text-[13px] text-dim">
            {c.host || 'no host set'} · {c.vpn.enabled ? `VPN ${c.vpn.gateway}` : 'no VPN'}
          </p>
        </div>
        <span className={`rounded-full px-2.5 py-0.5 text-[13px] font-bold ${PILL[s.state] ?? 'bg-pill text-dim'}`}>
          {s.state}
        </span>
        <button aria-label="Settings" className="grid size-9 place-items-center rounded-full hover:bg-hover">
          <Settings size={18} />
        </button>
        {connected
          ? <button className="h-[42px] w-[132px] rounded-full bg-bad-bg font-bold text-bad hover:brightness-110">
              Disconnect</button>
          : <button className="h-[42px] w-[132px] rounded-full bg-accent font-bold text-white hover:brightness-110">
              {s.state === 'Error' ? 'Reconnect' : 'Connect'}</button>}
      </div>

      {idle && (
        <label className="flex items-center gap-2.5 text-[15px]">
          <input type="checkbox" defaultChecked className="size-[18px] accent-[var(--color-accent)]" />
          Compute node on connect: {summary(c)}
        </label>
      )}

      {connected && (
        <div className="flex items-center gap-3">
          <span className="flex-1 font-bold">
            {s.node ? `Node ${s.node} · Job ${s.job}` : 'No compute node'}
          </span>
          <button className="h-[42px] rounded-full bg-pill px-6 font-bold hover:bg-selected">
            {s.node ? 'Release node' : 'Get node'}
          </button>
        </div>
      )}
      {connected && (
        <button className="flex h-9 w-fit items-center gap-2 rounded-md bg-pill px-3 font-bold hover:bg-selected">
          <LayoutGrid size={14} /> Open <ChevronDown size={14} />
        </button>
      )}

      <button onClick={() => setLog(!log)} className="flex w-fit items-center gap-1 text-[15px]">
        {log ? <ChevronDown size={14} /> : <ChevronRight size={14} />} Log
      </button>
      {log && <pre className="max-h-40 overflow-auto rounded-md bg-view p-3 text-xs text-dim">{s.log || ' '}</pre>}
    </section>
  )
}
