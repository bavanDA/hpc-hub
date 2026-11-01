// More › Agents: Running (every agent session, tap to open), Scheduled and Skills (experimental, like the desktop)
// and Permissions (what an agent may do on each cluster without asking). Start agent picks a cluster, then Claude,
// ChatGPT, Antigravity, Cursor, Ask all or VS Code in the browser.
import { Play, ShieldCheck } from 'lucide-react'
import { lazy, Suspense, useEffect, useState } from 'react'

import { setActiveCluster } from '@shared/components/clusters/active'
import { useClusters } from '@shared/components/clusters/store'
import { ToastProvider as SharedToasts } from '@shared/components/toast'
import { Spinner } from '@shared/components/ui'
import { usePageParams } from '@shared/nav'
import { call } from '@shared/rpc'
import type { Cluster } from '@shared/types/clusters'
import { Running } from '../parts/agents/Running'
import { Scheduled } from '../parts/agents/Scheduled'
import { Skills } from '../parts/agents/Skills'
import { StartPicker } from '../parts/agents/StartPicker'
import { useStart } from '../parts/agents/useStart'
import { Header } from '../parts/Header'
import { Button, Card, Chips, ListRow, Sheet } from '../ui'

const Permissions = lazy(() => import('@shared/pages/Permissions').then((m) => ({ default: m.Permissions })))

type Part = 'running' | 'scheduled' | 'skills' | 'permissions'

export function Agents() {
  const params = usePageParams()
  const { clusters } = useClusters()
  const [experimental, setExperimental] = useState(false)
  const [part, setPart] = useState<Part>((['running', 'scheduled', 'skills', 'permissions'] as Part[])
    .find((p) => p === params.tab) ?? 'running')
  const [perms, setPerms] = useState<Cluster | null>(null)
  const [starting, setStarting] = useState(false)
  const start = useStart()

  useEffect(() => {
    call<{ experimental: boolean }>('preferences.get').then((p) => setExperimental(p.experimental)).catch(() => {})
  }, [])
  const parts: (readonly [Part, string])[] = [['running', 'Running'],
    ...(experimental ? [['scheduled', 'Scheduled'] as const, ['skills', 'Skills'] as const] : []),
    ['permissions', 'Permissions']]
  const shown = parts.some(([p]) => p === part) ? part : 'running'

  return (
    <div className="flex h-full flex-col">
      <Header title="Agents">
        <Button kind="primary" icon={Play} className="h-11" onClick={() => setStarting(true)}>Start</Button>
      </Header>
      {/* chips, not segments: four labels don't fit side by side on a phone */}
      <div className="px-4 pb-2"><Chips one value={[shown]} onChange={([p]) => p && setPart(p)} options={parts} /></div>
      <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-4">
        {shown === 'running' && <Running />}
        {shown === 'scheduled' && <Scheduled />}
        {shown === 'skills' && <Skills />}
        {shown === 'permissions' && <>
          <p className="mb-2 text-sm text-dim">What Claude may do on each cluster without asking you.</p>
          <Card className="py-1">
            {(clusters ?? []).map((c) => (
              <ListRow key={c.id} icon={ShieldCheck} title={c.name} subtitle="Allowed commands and files"
                onClick={() => { setActiveCluster(c.id); setPerms(c) }} />
            ))}
          </Card>
        </>}
      </div>
      {perms && (
        <Sheet title={`${perms.name} permissions`} onClose={() => setPerms(null)}>
          <SharedToasts>
            <Suspense fallback={<Spinner />}><Permissions /></Suspense>
          </SharedToasts>
        </Sheet>
      )}
      {starting && <StartPicker onClose={() => setStarting(false)}
        onStart={(cluster, name, key) => { setStarting(false); start.open(cluster, name, key) }} />}
      {start.sheet}
    </div>
  )
}
