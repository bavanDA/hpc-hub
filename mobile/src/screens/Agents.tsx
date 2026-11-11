// Agents: the desktop's tabs, Running, Backup, Scheduled and Skills (each while its experimental switch is on) and
// Permissions, with the desktop's Start agent menu. The tab is a page param, go('agents', { tab }), and every tab but
// Running shows one cluster at a time (the chip in the header).
import { useEffect, useRef } from 'react'

import type { TabItem } from '@shared/components/app/Tabs'
import { ClusterPicker } from '@shared/components/clusters/ClusterPicker'
import { useClusters } from '@shared/components/clusters/store'
import { useGo, usePageParams } from '@shared/nav'
import { Permissions } from '../parts/agents/Permissions'
import { Running } from '../parts/agents/Running'
import { Scheduled } from '../parts/agents/Scheduled'
import { Skills } from '../parts/agents/Skills'
import { useStart } from '../parts/agents/useStart'
import { Backup } from '../parts/backup/Backup'
import { useExperiments } from '../parts/experiments'
import { Header } from '../parts/Header'
import { Tabs } from '../ui'

type AgentTab = 'running' | 'backup' | 'scheduled' | 'skills' | 'permissions'
const ALL: TabItem<AgentTab>[] = [
  { id: 'running', title: 'Running' }, { id: 'backup', title: 'Backup' }, { id: 'scheduled', title: 'Scheduled' },
  { id: 'skills', title: 'Skills' }, { id: 'permissions', title: 'Permissions' },
]

/** The sheet a start param asks for: claude or agent:claude, ask, vscode or vscode:browser (the phone has no app). */
function startKey(start?: string): string {
  if (!start) return ''
  if (start === 'ask' || start.startsWith('agent:')) return start
  if (start.startsWith('vscode')) return 'vscode'
  return `agent:${start}`
}

export function Agents() {
  const go = useGo()
  const params = usePageParams()
  const { clusters } = useClusters()
  const experiments = useExperiments()
  const shown = (t: AgentTab) => (t !== 'scheduled' || experiments.schedules) && (t !== 'skills' || experiments.skills)
  const asked = ALL.find((t) => t.id === params.tab)?.id ?? 'running'
  const tab = shown(asked) ? asked : 'running'
  const start = useStart()
  const openStart = start.open

  // go('agents', { cluster, folder, start }) from a cluster card, a project or a folder: open that window right away
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
      <Header title="Agents" chip={tab === 'running' ? undefined : <ClusterPicker />} />
      <Tabs label="Agents" current={tab} tabs={ALL.filter((t) => shown(t.id))}
        onPick={(t) => go('agents', { tab: t })} />
      <div className="flex min-h-0 flex-1 flex-col">
        {tab === 'running' && <Running onStart={openStart} />}
        {tab === 'backup' && <Backup />}
        {tab === 'scheduled' && <Scheduled />}
        {tab === 'skills' && <Skills />}
        {tab === 'permissions' && <Permissions />}
      </div>
      {start.sheet}
    </div>
  )
}
