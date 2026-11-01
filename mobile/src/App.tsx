// The phone app: one screen at a time, picked with the tabs at the bottom (docs/design/android.md).
import { Folder, ListChecks, Menu, Server, SquareTerminal, type LucideIcon } from 'lucide-react'
import { useState } from 'react'

import { Questions } from './parts/Questions'
import { Clusters } from './screens/Clusters'
import { Files } from './screens/Files'
import { Jobs } from './screens/Jobs'
import { More } from './screens/More'
import { Terminals } from './screens/Terminals'
import { ToastProvider } from './ui'

type Tab = 'clusters' | 'jobs' | 'terminals' | 'files' | 'more'
// the desktop sidebar's order: Clusters, then your work, then the cluster's jobs, then data
const TABS: [Tab, string, LucideIcon][] = [['clusters', 'Clusters', Server],
  ['terminals', 'Terminals', SquareTerminal], ['jobs', 'Jobs', ListChecks], ['files', 'Files', Folder],
  ['more', 'More', Menu]]
// a plain browser (design work with the demo data): ?tab=jobs opens that screen
const first = ('__TAURI_INTERNALS__' in window ? null : new URLSearchParams(location.search).get('tab')) as Tab | null

export default function App() {
  const [tab, setTab] = useState<Tab>(first ?? 'clusters')
  return (
    <ToastProvider>
      <div className="flex h-full flex-col pt-[var(--top)]">
        <main className="relative min-h-0 flex-1">
          {tab === 'clusters' && <Clusters />}
          {tab === 'jobs' && <Jobs />}
          {/* kept mounted: open terminals keep running while you look elsewhere */}
          <div className={tab === 'terminals' ? 'h-full' : 'hidden'}><Terminals shown={tab === 'terminals'} /></div>
          {tab === 'files' && <Files />}
          {tab === 'more' && <More />}
        </main>
        <nav className="flex shrink-0 border-t border-line bg-header pb-[var(--bottom)]">
          {TABS.map(([id, label, Icon]) => (
            <button key={id} onClick={() => setTab(id)} aria-current={tab === id}
              className={`flex h-16 flex-1 flex-col items-center justify-center gap-1 text-xs font-bold
                ${tab === id ? 'text-accent-text' : 'text-dim'}`}>
              <span className={`grid h-8 w-14 place-items-center rounded-full ${tab === id ? 'bg-accent/15' : ''}`}>
                <Icon size={22} /></span>
              {label}
            </button>
          ))}
        </nav>
      </div>
      <Questions />
    </ToastProvider>
  )
}
