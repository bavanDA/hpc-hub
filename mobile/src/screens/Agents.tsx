// More › Agents: Running (every agent session, tap to open), Scheduled and Skills (experimental, like the desktop)
// and Permissions (what an agent may do on each cluster without asking). Start agent picks a cluster, then Claude,
// ChatGPT, Antigravity, Cursor, Ask all or VS Code in the browser.
import { Play, ShieldCheck } from 'lucide-react'
import { lazy, Suspense, useEffect, useRef, useState } from 'react'

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
import { shortName } from '../parts/NodeSheet'
import { Button, Chips, Row, Section, Sheet } from '../ui'

const Permissions = lazy(() => import('@shared/pages/Permissions').then((m) => ({ default: m.Permissions })))

type Part = 'running' | 'scheduled' | 'skills' | 'permissions'

/** The sheet a start param asks for: claude or agent:claude, ask, vscode or vscode:browser (the phone has no app). */
function startKey(start?: string): string {
  if (!start) return ''
  if (start === 'ask' || start.startsWith('agent:')) return start
  if (start.startsWith('vscode')) return 'vscode'
  return `agent:${start}`
}

export function Agents() {
  const params = usePageParams()
  const { clusters } = useClusters()
  const [experimental, setExperimental] = useState(false)
  const [part, setPart] = useState<Part>((['running', 'scheduled', 'skills', 'permissions'] as Part[])
    .find((p) => p === params.tab) ?? 'running')
  const [perms, setPerms] = useState<Cluster | null>(null)
  const [starting, setStarting] = useState(false)
  const start = useStart()
  const openStart = start.open

  useEffect(() => {
    call<{ experimental: boolean }>('preferences.get').then((p) => setExperimental(p.experimental)).catch(() => {})
  }, [])
  // go('agents', { cluster, folder, start }) from a cluster card, a project or a folder: open that sheet right away
  const handled = useRef<Record<string, string> | null>(null)
  useEffect(() => {
    const key = startKey(params.start)
    if (!key || !params.cluster || !clusters || handled.current === params) return
    handled.current = params
    const name = clusters.find((c) => c.id === params.cluster)?.name ?? params.cluster
    openStart(params.cluster, name, key, params.folder ?? '')
  }, [params, clusters, openStart])
  const parts: (readonly [Part, string])[] = [['running', 'Running'],
    ...(experimental ? [['scheduled', 'Scheduled'] as const, ['skills', 'Skills'] as const] : []),
    ['permissions', 'Permissions']]
  const shown = parts.some(([p]) => p === part) ? part : 'running'

  return (
    <div className="flex h-full flex-col">
      <Header title="Agents">
        <Button kind="primary" icon={Play} onClick={() => setStarting(true)}>Start</Button>
      </Header>
      {/* chips, not segments: four labels don't fit side by side on a phone */}
      <div className="px-4 pb-2"><Chips one value={[shown]} onChange={([p]) => p && setPart(p)} options={parts} /></div>
      <div className="min-h-0 flex-1 overflow-y-auto pb-6">
        {shown === 'running' && <Running />}
        {shown === 'scheduled' && <Scheduled />}
        {shown === 'skills' && <Skills />}
        {shown === 'permissions' && (
          <Section note="What Claude may do on each cluster without asking you.">
            {(clusters ?? []).map((c) => (
              <Row key={c.id} icon={ShieldCheck} label={shortName(c)} opens
                onPress={() => { setActiveCluster(c.id); setPerms(c) }} />
            ))}
          </Section>
        )}
      </div>
      {perms && (
        <Sheet title={`Permissions on ${shortName(perms)}`} onClose={() => setPerms(null)}>
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
