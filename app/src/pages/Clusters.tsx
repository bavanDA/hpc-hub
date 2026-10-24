import { Server } from 'lucide-react'
import { useEffect, useState } from 'react'

import { call } from '../rpc'
import type { Cluster } from '../types'

export function Clusters() {
  const [clusters, setClusters] = useState<Cluster[] | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    call<Cluster[]>('clusters.list').then(setClusters).catch((e: Error) => setError(e.message))
  }, [])

  if (error) return <p className="p-8 text-bad">Could not load clusters: {error}</p>
  if (!clusters) return <p className="p-8 text-muted">Loading…</p>
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4 p-8">
      {clusters.map((c) => (
        <section key={c.id} className="flex items-center gap-4 rounded-xl border border-line bg-panel p-5 shadow-sm">
          <Server size={28} strokeWidth={1.5} className="text-muted" />
          <div className="min-w-0 flex-1">
            <h2 className="text-lg font-semibold">{c.name}</h2>
            <p className="truncate text-xs text-muted">
              {c.host || 'no host set'} · {c.vpn.enabled ? `VPN ${c.vpn.gateway}` : 'no VPN'}
            </p>
          </div>
          <span className="rounded-full bg-line px-2.5 py-0.5 text-xs text-muted">Disconnected</span>
          <button disabled title="Coming in the next step"
            className="rounded-full bg-accent px-5 py-2 text-sm font-medium text-white opacity-50">
            Connect
          </button>
        </section>
      ))}
    </div>
  )
}
