import { lazy, Suspense, useCallback, useEffect, useState, type ComponentType } from 'react'

import { Server } from 'lucide-react'

import { AppKeys } from './components/app/AppKeys'
import { LinkPicker } from './components/app/LinkPicker'
import { useSessionNotifications } from './components/app/notify'
import { Onboarding } from './components/app/Onboarding'
import { GROUPS, HOME, type Page } from './components/app/pages'
import type { SetupStatus } from './components/app/setup'
import { experimentsOf, NO_EXPERIMENTS, type Experiments, type Preferences } from './components/app/types'
import { useWatch } from './components/app/watch'
import { Welcome } from './components/app/Welcome'
import { useBackupAlertWatch } from './components/backup/alerts'
import { setActiveCluster } from './components/clusters/active'
import { ClusterPicker } from './components/clusters/ClusterPicker'
import { HeaderBar } from './components/HeaderBar'
import { Questions } from './components/Questions'
import { Sidebar } from './components/Sidebar'
import { ToastProvider } from './components/toast'
import { EmptyState } from './components/ui/EmptyState'
import { Spinner } from './components/ui/Spinner'
import { leave, NavContext } from './nav'
import { Clusters } from './pages/Clusters'
import { call } from './rpc'
import { setAppearance } from './theme'

// Pages load the first time you open them, so the app starts fast (Clusters is the first screen)
const Agents = lazy(() => import('./pages/Agents').then((m) => ({ default: m.Agents })))
const Code = lazy(() => import('./pages/Code').then((m) => ({ default: m.Code })))
const FilesPage = lazy(() => import('./pages/FilesPage').then((m) => ({ default: m.FilesPage })))
const Jobs = lazy(() => import('./pages/Jobs').then((m) => ({ default: m.Jobs })))
const Latex = lazy(() => import('./pages/Latex').then((m) => ({ default: m.Latex })))
const Projects = lazy(() => import('./pages/Projects').then((m) => ({ default: m.Projects })))
const Terminals = lazy(() => import('./pages/Terminals').then((m) => ({ default: m.Terminals })))
const Usage = lazy(() => import('./pages/Usage').then((m) => ({ default: m.Usage })))

const ITEMS = [HOME, ...GROUPS.flatMap(([, items]) => items)]
/** The experimental pages and the switch in Settings that shows each. */
const EXPERIMENTAL = new Map(ITEMS.flatMap((i) => i.experiment ? [[i.page, i.experiment] as const] : []))
const off = (p: Page, e: Experiments) => { const k = EXPERIMENTAL.get(p); return !!k && !e[k] }
const TITLES = Object.fromEntries(ITEMS.map((i) => [i.page, i.title])) as Record<Page, string>

/** Pages that became a tab of another one: go('permissions') still works. */
const MOVED: Partial<Record<Page, [Page, string]>> = {
  permissions: ['agents', 'permissions'], skills: ['agents', 'skills'], schedules: ['agents', 'scheduled'],
  globus: ['files', 'transfers'], backup: ['agents', 'backup'],
}

const PAGES: Partial<Record<Page, ComponentType>> = {
  clusters: Clusters, projects: Projects, terminals: Terminals, code: Code, jobs: Jobs, usage: Usage,
  files: FilesPage, latex: Latex,
}

/** Pages that show one cluster at a time get the cluster picker in the header (per tab where they have tabs). */
function picksCluster(page: Page, tab = ''): boolean {
  if (page === 'jobs' || page === 'usage') return true
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
  const [experiments, setExperiments] = useState<Experiments>(NO_EXPERIMENTS)
  const [prefsRead, setPrefsRead] = useState(false)  // until then an experimental page waits: it may be off
  const [settings, setSettings] = useState(false)
  const go = useCallback((p: Page, with_: Record<string, string> = {}) => leave(() => {
    const moved = MOVED[p]
    if (with_.cluster) setActiveCluster(with_.cluster)
    if (moved) { setPage(moved[0]); setParams({ ...with_, tab: moved[1] }) } else { setPage(p); setParams(with_) }
    setFloating(false)
  }), [])
  const [blocked, setBlocked] = useState('')
  const [setup, setSetup] = useState<SetupStatus | null>(null)
  const [onboard, setOnboard] = useState<string[] | null>(null)  // the clusters just chosen, to set up
  useEffect(() => {
    call<Preferences>('preferences.get').then((p) => {
      setExperiments(experimentsOf(p))
      setAppearance(p.appearance)
      if (off(start as Page, experimentsOf(p))) setPage('clusters')  // ?page=latex while it's off
    }).catch(() => {}).finally(() => setPrefsRead(true))
    call<{ blocked: boolean; message: string }>('app.status').then((s) => setBlocked(s.blocked ? s.message : ''))
      .catch(() => {})
    call<SetupStatus>('setup.status').then(setSetup).catch(() => {})
  }, [])
  const showExperimental = (e: Experiments) => {
    setExperiments(e)
    if (off(page, e)) go('clusters')
  }
  useSessionNotifications()
  useWatch()
  useBackupAlertWatch()
  if (setup?.first_run && !blocked) {
    return (
      <div className="flex h-full flex-col">
        <HeaderBar title="HPC Hub" />
        {onboard
          ? <Onboarding ids={onboard} onDone={() => location.reload()} />
          : <Welcome status={setup} onDone={setOnboard} />}
      </div>
    )
  }
  if (blocked) {
    return (
      <div className="flex h-full flex-col">
        <HeaderBar title="HPC Hub" />
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
        {sidebar && <Sidebar page={page} onPick={(p) => go(p)} experiments={experiments} floating={narrow}
          onSettings={() => { setFloating(false); setSettings(true) }} />}
        {narrow && floating && <div className="fixed inset-0 z-30 bg-scrim" onClick={() => setFloating(false)} />}
        <main className="flex min-w-0 flex-1 flex-col">
          <HeaderBar title={TITLES[page]} onSidebar={toggle} sidebar={sidebar && !narrow}
            chip={picksCluster(page, params.tab) ? <ClusterPicker /> : undefined} />
          <div className="min-h-0 flex-1 overflow-auto">
            <Suspense fallback={<div className="grid h-full place-items-center"><Spinner size={24} /></div>}>
              {page === 'agents' ? <Agents experiments={experiments} />
                : off(page, experiments)
                  ? (prefsRead ? <p className="p-8 text-dim">{TITLES[page]} is experimental.</p> : null)
                  : Current ? <Current /> : <p className="p-8 text-dim">{TITLES[page]} is experimental.</p>}
            </Suspense>
          </div>
        </main>
      </div>
      <AppKeys settings={settings} onSettings={() => setSettings(true)} onClose={() => setSettings(false)}
        onExperimental={showExperimental} />
      <Questions />
      <LinkPicker />
    </ToastProvider>
    </NavContext.Provider>
  )
}
