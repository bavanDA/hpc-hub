import { lazy, Suspense, useCallback, useEffect, useState, type ComponentType } from 'react'

import { Server } from 'lucide-react'

import { LinkPicker } from './components/app/LinkPicker'
import { Onboarding } from './components/app/Onboarding'
import { PreferencesDialog } from './components/app/Preferences'
import { Welcome, type SetupStatus } from './components/app/Welcome'
import { useSessionNotifications } from './components/app/notify'
import type { Preferences } from './components/app/types'
import { useWatch } from './components/app/watch'
import { setActiveCluster } from './components/clusters/active'
import { ClusterPicker } from './components/clusters/ClusterPicker'
import { HeaderBar } from './components/HeaderBar'
import { Questions } from './components/Questions'
import { useBackupAlertWatch } from './components/backup/alerts'
import { GROUPS, HOME, Sidebar, type Page } from './components/Sidebar'
import { ToastProvider } from './components/toast'
import { EmptyState, Spinner } from './components/ui'
import { NavContext } from './nav'
import { Clusters } from './pages/Clusters'
import { call } from './rpc'
import { setAppearance } from './theme'

// Pages load the first time you open them, so the app starts fast (Clusters is the first screen)
const Agents = lazy(() => import('./pages/Agents').then((m) => ({ default: m.Agents })))
const Backup = lazy(() => import('./pages/Backup').then((m) => ({ default: m.Backup })))
const Code = lazy(() => import('./pages/Code').then((m) => ({ default: m.Code })))
const FilesPage = lazy(() => import('./pages/FilesPage').then((m) => ({ default: m.FilesPage })))
const Jobs = lazy(() => import('./pages/Jobs').then((m) => ({ default: m.Jobs })))
const Latex = lazy(() => import('./pages/Latex').then((m) => ({ default: m.Latex })))
const Projects = lazy(() => import('./pages/Projects').then((m) => ({ default: m.Projects })))
const Terminals = lazy(() => import('./pages/Terminals').then((m) => ({ default: m.Terminals })))
const Usage = lazy(() => import('./pages/Usage').then((m) => ({ default: m.Usage })))

const ITEMS = [HOME, ...GROUPS.flatMap(([, items]) => items)]
const EXPERIMENTAL = new Set(ITEMS.filter((i) => i.experimental).map((i) => i.page))
const TITLES = Object.fromEntries(ITEMS.map((i) => [i.page, i.title])) as Record<Page, string>

/** Pages that became a tab of another one: go('permissions') still works. */
const MOVED: Partial<Record<Page, [Page, string]>> = {
  permissions: ['agents', 'permissions'], skills: ['agents', 'skills'], schedules: ['agents', 'scheduled'],
  globus: ['files', 'transfers'],
}

const PAGES: Partial<Record<Page, ComponentType>> = {
  clusters: Clusters, projects: Projects, terminals: Terminals, code: Code, backup: Backup, jobs: Jobs, usage: Usage,
  files: FilesPage, latex: Latex,
}

/** Pages that show one cluster at a time get the cluster picker in the header (per tab where they have tabs). */
function picksCluster(page: Page, tab = ''): boolean {
  if (page === 'jobs' || page === 'usage' || page === 'backup') return true
  if (page === 'files') return tab !== 'transfers'
  if (page === 'agents') return !!tab && tab !== 'running'
  return false
}

const NARROW = 900  // under this width the sidebar floats over the page instead of taking room

function useNarrow() {
  const [narrow, setNarrow] = useState(() => window.innerWidth < NARROW)
  useEffect(() => {
    const q = window.matchMedia(`(max-width: ${NARROW - 1}px)`)
    const on = () => setNarrow(q.matches)
    q.addEventListener('change', on)
    return () => q.removeEventListener('change', on)
  }, [])
  return narrow
}

export default function App() {
  // ?page=jobs&tab=… opens a page directly, with cluster, path and step too (screenshots of the browser preview)
  const search = new URLSearchParams(location.search)
  const startAsked = search.get('page') as Page | null
  const [start, startTab] = startAsked && MOVED[startAsked] ? MOVED[startAsked]!
    : [startAsked && startAsked in TITLES ? startAsked : 'clusters', search.get('tab') ?? '']
  const [page, setPage] = useState<Page>(start as Page)
  const [params, setParams] = useState<Record<string, string>>(() => ({
    ...Object.fromEntries([...search].filter(([k]) => ['cluster', 'path', 'step'].includes(k))),
    ...(startTab ? { tab: startTab } : {}),
  }))
  const narrow = useNarrow()
  const [sidebarWanted, setSidebar] = useState(true)
  const [floating, setFloating] = useState(false)  // narrow window: the sidebar shown over the page
  const sidebar = narrow ? floating : sidebarWanted
  const [experimental, setExperimental] = useState(false)
  const [settings, setSettings] = useState(false)
  const go = useCallback((p: Page, with_: Record<string, string> = {}) => {
    const moved = MOVED[p]
    if (with_.cluster) setActiveCluster(with_.cluster)
    if (moved) { setPage(moved[0]); setParams({ ...with_, tab: moved[1] }) } else { setPage(p); setParams(with_) }
    setFloating(false)
  }, [])
  const [blocked, setBlocked] = useState('')
  const [setup, setSetup] = useState<SetupStatus | null>(null)
  const [onboard, setOnboard] = useState<string[] | null>(null)  // the clusters just chosen, to set up
  useEffect(() => {
    call<Preferences>('preferences.get').then((p) => {
      setExperimental(p.experimental)
      setAppearance(p.appearance)
    }).catch(() => {})
    call<{ blocked: boolean; message: string }>('app.status').then((s) => setBlocked(s.blocked ? s.message : ''))
      .catch(() => {})
    call<SetupStatus>('setup.status').then(setSetup).catch(() => {})
  }, [])
  const showExperimental = (on: boolean) => {
    setExperimental(on)
    if (!on && EXPERIMENTAL.has(page)) go('clusters')
  }
  useSessionNotifications()
  useWatch()
  useBackupAlertWatch()
  if (setup?.first_run && !blocked) {
    return (
      <div className="flex h-full flex-col">
        <HeaderBar title="HPC Hub" onExperimental={() => {}} />
        {onboard
          ? <Onboarding ids={onboard} onDone={() => location.reload()} />
          : <Welcome status={setup} onDone={setOnboard} />}
      </div>
    )
  }
  if (blocked) {
    return (
      <div className="flex h-full flex-col">
        <HeaderBar title="HPC Hub" onExperimental={() => {}} />
        <EmptyState icon={Server} title="HPC Hub is already open" text={blocked} />
      </div>
    )
  }
  const Current = PAGES[page]
  const toggle = () => (narrow ? setFloating(!floating) : setSidebar(!sidebarWanted))
  return (
    <NavContext.Provider value={{ go, params }}>
    <ToastProvider>
      <div className="flex h-full">
        {sidebar && <Sidebar page={page} onPick={(p) => go(p)} experimental={experimental} floating={narrow}
          onSettings={() => { setFloating(false); setSettings(true) }} />}
        {narrow && floating && <div className="fixed inset-0 z-30 bg-scrim" onClick={() => setFloating(false)} />}
        <main className="flex min-w-0 flex-1 flex-col">
          <HeaderBar title={TITLES[page]} onSidebar={toggle} sidebar={sidebar && !narrow}
            onExperimental={showExperimental} chip={picksCluster(page, params.tab) ? <ClusterPicker /> : undefined} />
          <div className="min-h-0 flex-1 overflow-auto">
            <Suspense fallback={<div className="grid h-full place-items-center"><Spinner size={24} /></div>}>
              {page === 'agents' ? <Agents experimental={experimental} />
                : Current ? <Current /> : <p className="p-8 text-dim">{TITLES[page]} is experimental.</p>}
            </Suspense>
          </div>
        </main>
      </div>
      {settings && <PreferencesDialog onClose={() => setSettings(false)} onExperimental={showExperimental} />}
      <Questions />
      <LinkPicker />
    </ToastProvider>
    </NavContext.Provider>
  )
}
