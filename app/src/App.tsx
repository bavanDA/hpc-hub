import { useCallback, useState, type ComponentType } from 'react'

import { HeaderBar } from './components/HeaderBar'
import { Questions } from './components/Questions'
import { GROUPS, Sidebar, type Page } from './components/Sidebar'
import { ToastProvider } from './components/toast'
import { NavContext } from './nav'
import { Clusters } from './pages/Clusters'
import { Files } from './pages/Files'
import { Globus } from './pages/Globus'
import { Jobs } from './pages/Jobs'
import { Permissions } from './pages/Permissions'
import { Projects } from './pages/Projects'
import { Schedules } from './pages/Schedules'
import { Skills } from './pages/Skills'
import { Terminals } from './pages/Terminals'
import { Usage } from './pages/Usage'

const TITLES = Object.fromEntries(GROUPS.flatMap(([, items]) => items.map((i) => [i.page, i.title]))) as
  Record<Page, string>

const PAGES: Partial<Record<Page, ComponentType>> = {
  projects: Projects, terminals: Terminals, permissions: Permissions, clusters: Clusters, jobs: Jobs,
  usage: Usage, files: Files, globus: Globus,
  skills: Skills,
  schedules: Schedules,
}

export default function App() {
  // ?page=jobs opens a page directly (handy for screenshots of the browser preview)
  const start = new URLSearchParams(location.search).get('page') as Page | null
  const [page, setPage] = useState<Page>(start && start in TITLES ? start : 'clusters')
  const [params, setParams] = useState<Record<string, string>>({})
  const [sidebar, setSidebar] = useState(true)
  const go = useCallback((p: Page, with_: Record<string, string> = {}) => { setPage(p); setParams(with_) }, [])
  const Current = PAGES[page]
  return (
    <NavContext.Provider value={{ go, params }}>
    <ToastProvider>
      <div className="flex h-full">
        {sidebar && <Sidebar page={page} onPick={(p) => go(p)} experimental={false} />}
        <main className="flex min-w-0 flex-1 flex-col">
          <HeaderBar title={TITLES[page]} onSidebar={() => setSidebar(!sidebar)} />
          <div className="min-h-0 flex-1 overflow-auto">
            {Current ? <Current /> : <p className="p-8 text-dim">{TITLES[page]} is experimental.</p>}
          </div>
        </main>
      </div>
      <Questions />
    </ToastProvider>
    </NavContext.Provider>
  )
}
