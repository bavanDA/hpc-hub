// More › Agents: Running (every agent session, tap to open; Scheduled and Skills under it when experimental is on)
// and Permissions (what an agent may do on each cluster without asking). Start agent picks a cluster, then Claude,
// ChatGPT, Antigravity, Cursor, Ask all or VS Code in the browser.
import { AlarmClock, BookOpen, Play, ShieldCheck } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'

import { shortName } from '@shared/components/clusters/loginCopy'
import { setActiveCluster } from '@shared/components/clusters/active'
import { useClusters } from '@shared/components/clusters/store'
import { usePageParams } from '@shared/nav'
import { call } from '@shared/rpc'
import type { Cluster } from '@shared/types/clusters'
import { PermissionsSheet } from '../parts/agents/PermissionsSheet'
import { Running } from '../parts/agents/Running'
import { Scheduled } from '../parts/agents/Scheduled'
import { Skills } from '../parts/agents/Skills'
import { StartPicker } from '../parts/agents/StartPicker'
import { useStart } from '../parts/agents/useStart'
import { Header } from '../parts/Header'
import { Button, Row, Section, Segments, Sheet } from '../ui'

type Part = 'running' | 'permissions'
type More = 'scheduled' | 'skills'

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
  const [part, setPart] = useState<Part>(params.tab === 'permissions' ? 'permissions' : 'running')
  const [more, setMore] = useState<More | null>(params.tab === 'scheduled' || params.tab === 'skills' ? params.tab : null)
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

  return (
    <div className="flex h-full flex-col">
      <Header title="Agents">
        <Button kind="primary" icon={Play} onClick={() => setStarting(true)}>Start</Button>
      </Header>
      <div className="px-4 pb-2"><Segments label="Show" value={part} onChange={setPart}
        options={[['running', 'Running'], ['permissions', 'Permissions']] as const} /></div>
      <div className="min-h-0 flex-1 overflow-y-auto pb-6">
        {part === 'running' && <Running />}
        {part === 'running' && experimental && (
          <Section>
            <Row icon={AlarmClock} label="Scheduled" sub="Agents that run at a set time" opens
              onPress={() => setMore('scheduled')} />
            <Row icon={BookOpen} label="Skills" sub="What agents know how to do" opens onPress={() => setMore('skills')} />
          </Section>
        )}
        {part === 'permissions' && (
          <Section note="What Claude may do on each cluster without asking you.">
            {(clusters ?? []).map((c) => (
              <Row key={c.id} icon={ShieldCheck} label={shortName(c)} opens
                onPress={() => { setActiveCluster(c.id); setPerms(c) }} />
            ))}
          </Section>
        )}
      </div>
      {perms && <PermissionsSheet cluster={perms} onClose={() => setPerms(null)} />}
      {more && experimental && (
        <Sheet flush title={more === 'scheduled' ? 'Scheduled' : 'Skills'} onClose={() => setMore(null)}>
          {more === 'scheduled' ? <Scheduled /> : <Skills />}
        </Sheet>
      )}
      {starting && <StartPicker onClose={() => setStarting(false)}
        onStart={(cluster, name, key) => { setStarting(false); start.open(cluster, name, key) }} />}
      {start.sheet}
    </div>
  )
}
