import { useState } from 'react'

import { Sidebar, type Page } from './components/Sidebar'
import { Clusters } from './pages/Clusters'

const TITLES: Record<Page, string> = {
  projects: 'Projects', latex: 'LaTeX', terminals: 'Terminals', schedules: 'Scheduled agents', skills: 'Skills',
  permissions: 'Permissions', clusters: 'Clusters', jobs: 'Jobs', usage: 'Usage', files: 'Files', globus: 'Globus',
}

export default function App() {
  const [page, setPage] = useState<Page>('clusters')
  return (
    <div className="flex h-full">
      <Sidebar page={page} onPick={setPage} experimental={false} />
      <main className="flex min-w-0 flex-1 flex-col">
        <header className="border-b border-line px-6 py-3 text-center text-sm font-semibold">{TITLES[page]}</header>
        <div className="flex-1 overflow-auto">
          {page === 'clusters' ? <Clusters />
            : <p className="p-8 text-muted">{TITLES[page]} comes in a later step. The GTK app has it today.</p>}
        </div>
      </main>
    </div>
  )
}
