import { useState } from 'react'

import { HeaderBar } from './components/HeaderBar'
import { GROUPS, Sidebar, type Page } from './components/Sidebar'
import { Clusters } from './pages/Clusters'

const TITLES = Object.fromEntries(GROUPS.flatMap(([, items]) => items.map((i) => [i.page, i.title]))) as
  Record<Page, string>

export default function App() {
  const [page, setPage] = useState<Page>('clusters')
  const [sidebar, setSidebar] = useState(true)
  return (
    <div className="flex h-full">
      {sidebar && <Sidebar page={page} onPick={setPage} experimental={false} />}
      <main className="flex min-w-0 flex-1 flex-col">
        <HeaderBar title={TITLES[page]} onSidebar={() => setSidebar(!sidebar)} />
        <div className="flex-1 overflow-auto">
          {page === 'clusters' ? <Clusters />
            : <p className="p-8 text-dim">{TITLES[page]} comes in a later step. The GTK app has it today.</p>}
        </div>
      </main>
    </div>
  )
}
