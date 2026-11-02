// Agents: everything about the AI agents in one place. Running (all clusters), then per cluster (the header's
// cluster picker): Backup, Scheduled and Skills (experimental), and Permissions. go('agents', { tab: 'permissions' }).
import { lazy, Suspense } from 'react'

import { Running } from '../components/agents/Running'
import { Tabs, type TabItem } from '../components/app/Tabs'
import { Spinner } from '../components/ui'
import { useGo, usePageParams } from '../nav'

const Permissions = lazy(() => import('./Permissions').then((m) => ({ default: m.Permissions })))
const Schedules = lazy(() => import('./Schedules').then((m) => ({ default: m.Schedules })))
const Skills = lazy(() => import('./Skills').then((m) => ({ default: m.Skills })))
const Backup = lazy(() => import('./Backup').then((m) => ({ default: m.Backup })))

export type AgentTab = 'running' | 'backup' | 'scheduled' | 'skills' | 'permissions'
const EXPERIMENTAL: AgentTab[] = ['scheduled', 'skills']
const ALL: TabItem<AgentTab>[] = [
  { id: 'running', title: 'Running' }, { id: 'backup', title: 'Backup' }, { id: 'scheduled', title: 'Scheduled' }, { id: 'skills', title: 'Skills' },
  { id: 'permissions', title: 'Permissions' },
]

/** The tab to show: the one asked for, unless it's experimental and those are off. */
export function agentTab(asked: string | undefined, experimental: boolean): AgentTab {
  const t = ALL.find((x) => x.id === asked)?.id ?? 'running'
  return !experimental && EXPERIMENTAL.includes(t) ? 'running' : t
}

export function Agents({ experimental }: { experimental: boolean }) {
  const go = useGo()
  const tab = agentTab(usePageParams().tab, experimental)
  const tabs = ALL.filter((t) => experimental || !EXPERIMENTAL.includes(t.id))
  return (
    <div className="flex h-full flex-col">
      <Tabs label="Agents" tabs={tabs} current={tab} onPick={(t) => go('agents', { tab: t })} />
      <div className="min-h-0 flex-1 overflow-auto">
        <Suspense fallback={<div className="grid h-64 place-items-center"><Spinner size={24} /></div>}>
          {tab === 'running' && <Running />}
          {tab === 'backup' && <Backup />}
          {tab === 'scheduled' && <Schedules />}
          {tab === 'skills' && <Skills />}
          {tab === 'permissions' && <Permissions />}
        </Suspense>
      </div>
    </div>
  )
}
