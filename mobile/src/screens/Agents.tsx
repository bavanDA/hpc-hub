// More › Agents: what the agents may do on each cluster (the desktop's Permissions page in a sheet). Running agents,
// starting one, Scheduled and Skills come next.
import { ShieldCheck } from 'lucide-react'
import { lazy, Suspense, useState } from 'react'

import { setActiveCluster } from '@shared/components/clusters/active'
import { useClusters } from '@shared/components/clusters/store'
import { ToastProvider as SharedToasts } from '@shared/components/toast'
import { Spinner } from '@shared/components/ui'
import type { Cluster } from '@shared/types/clusters'
import { Header } from '../parts/Header'
import { Card, ListRow, Sheet } from '../ui'

const Permissions = lazy(() => import('@shared/pages/Permissions').then((m) => ({ default: m.Permissions })))

export function Agents() {
  const { clusters } = useClusters()
  const [perms, setPerms] = useState<Cluster | null>(null)
  return (
    <div className="flex h-full flex-col">
      <Header title="Agents" />
      <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-4">
        <h2 className="mb-2 text-sm font-bold text-dim">Permissions</h2>
        <Card className="py-1">
          {(clusters ?? []).map((c) => (
            <ListRow key={c.id} icon={ShieldCheck} title={c.name} subtitle="What Claude may do there without asking"
              onClick={() => { setActiveCluster(c.id); setPerms(c) }} />
          ))}
        </Card>
      </div>
      {perms && (
        <Sheet title={perms.name} onClose={() => setPerms(null)}>
          <SharedToasts>
            <Suspense fallback={<Spinner />}><Permissions /></Suspense>
          </SharedToasts>
        </Sheet>
      )}
    </div>
  )
}
