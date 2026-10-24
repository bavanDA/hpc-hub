import { lazy, Suspense, useCallback, useEffect, useState, type ComponentType } from 'react'

import { LinkPicker } from './components/app/LinkPicker'
import { useSessionNotifications } from './components/app/notify'
import type { Preferences } from './components/app/types'
import { HeaderBar } from './components/HeaderBar'
import { Questions } from './components/Questions'
import { GROUPS, Sidebar, type Page } from './components/Sidebar'
import { ToastProvider } from './components/toast'
import { Spinner } from './components/ui'
import { NavContext } from './nav'
import { Clusters } from './pages/Clusters'
import { call } from './rpc'

// Pages load the first time you open them, so the app starts fast (Clusters is the first screen)
const Files = lazy(() => import('./pages/Files').then((m) => ({ default: m.Files })))
const Globus = lazy(() => import('./pages/Globus').then((m) => ({ default: m.Globus })))
const Jobs = lazy(() => import('./pages/Jobs').then((m) => ({ default: m.Jobs })))
const Latex = lazy(() => import('./pages/Latex').then((m) => ({ default: m.Latex })))
const Permissions = lazy(() => import('./pages/Permissions').then((m) => ({ default: m.Permissions })))
const Projects = lazy(() => import('./pages/Projects').then((m) => ({ default: m.Projects })))
const Schedules = lazy(() => import('./pages/Schedules').then((m) => ({ default: m.Schedules })))
const Skills = lazy(() => import('./pages/Skills').then((m) => ({ default: m.Skills })))
const Terminals = lazy(() => import('./pages/Terminals').then((m) => ({ default: m.Terminals })))
const Usage = lazy(() => import('./pages/Usage').then((m) => ({ default: m.Usage })))

const EXPERIMENTAL = new Set(GROUPS.flatMap(([, items]) => items.filter((i) => i.experimental).map((i) => i.page)))

const TITLES = Object.fromEntries(GROUPS.flatMap(([, items]) => items.map((i) => [i.page, i.title]))) as
  Record<Page, string>

const PAGES: Partial<Record<Page, ComponentType>> = {
  projects: Projects, terminals: Terminals, permissions: Permissions, clusters: Clusters, jobs: Jobs,
  usage: Usage, files: Files, globus: Globus, latex: Latex,
  skills: Skills,
  schedules: Schedules,
}

export default function App() {
  // ?page=jobs opens a page directly (handy for screenshots of the browser preview)
  const start = new URLSearchParams(location.search).get('page') as Page | null
  const [page, setPage] = useState<Page>(start && start in TITLES ? start : 'clusters')
  const [params, setParams] = useState<Record<string, string>>({})
  const [sidebar, setSidebar] = useState(true)
  const [experimental, setExperimental] = useState(false)
  const go = useCallback((p: Page, with_: Record<string, string> = {}) => { setPage(p); setParams(with_) }, [])
  useEffect(() => {
    call<Preferences>('preferences.get').then((p) => setExperimental(p.experimental)).catch(() => {})
  }, [])
  const showExperimental = (on: boolean) => {
    setExperimental(on)
    if (!on && EXPERIMENTAL.has(page)) go('clusters')
  }
  useSessionNotifications()
  const Current = PAGES[page]
  return (
    <NavContext.Provider value={{ go, params }}>
    <ToastProvider>
      <div className="flex h-full">
        {sidebar && <Sidebar page={page} onPick={(p) => go(p)} experimental={experimental} />}
        <main className="flex min-w-0 flex-1 flex-col">
          <HeaderBar title={TITLES[page]} onSidebar={() => setSidebar(!sidebar)} sidebar={sidebar}
            onExperimental={showExperimental} />
          <div className="min-h-0 flex-1 overflow-auto">
            {Current
              ? <Suspense fallback={<div className="grid h-full place-items-center"><Spinner size={24} /></div>}>
                  <Current />
                </Suspense>
              : <p className="p-8 text-dim">{TITLES[page]} is experimental.</p>}
          </div>
        </main>
      </div>
      <Questions />
      <LinkPicker />
    </ToastProvider>
    </NavContext.Provider>
  )
}
