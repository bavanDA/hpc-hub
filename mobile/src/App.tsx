// The phone app: one screen at a time, picked with the tabs at the bottom; the rest is under More
// (docs/design/android.md). nav.tsx keeps where you are and makes Android's Back close things in order.
import { FileCode2, ListChecks, Menu, Server, SquareTerminal, type LucideIcon } from 'lucide-react'
import { lazy, Suspense } from 'react'

import { Spinner } from '@shared/components/ui'
import { firstPlace, NavProvider, usePhoneNav, type Tab } from './nav'
import { useEditorKeyboard } from './parts/keyboard'
import { Questions } from './parts/Questions'
import { PhoneWatch } from './parts/watchPhone'
import { Clusters } from './screens/Clusters'
import { More } from './screens/More'
import { Terminals } from './screens/Terminals'
import { ToastProvider } from './ui'

const Code = lazy(() => import('./screens/Code').then((m) => ({ default: m.Code })))
const Jobs = lazy(() => import('./screens/Jobs').then((m) => ({ default: m.Jobs })))

// the desktop sidebar's order: Clusters, then your work, then the cluster's jobs, and More for the rest
const TABS: [Tab, string, LucideIcon][] = [['clusters', 'Clusters', Server],
  ['terminals', 'Terminals', SquareTerminal], ['code', 'Code', FileCode2], ['jobs', 'Jobs', ListChecks],
  ['more', 'More', Menu]]

function Screens() {
  const { place, open } = usePhoneNav()
  const tab = place.tab
  const typing = useEditorKeyboard() && tab === 'code'  // the editor gets the tabs' room while the keyboard is up
  return (
    <div className="flex h-full flex-col pt-[var(--top)]">
      <main className="relative min-h-0 flex-1">
        <Suspense fallback={<div className="grid h-full place-items-center"><Spinner size={28} /></div>}>
          {tab === 'clusters' && <Clusters />}
          {/* kept mounted: open terminals keep running while you look elsewhere */}
          <div className={tab === 'terminals' ? 'h-full' : 'hidden'}><Terminals shown={tab === 'terminals'} /></div>
          {tab === 'code' && <Code />}
          {tab === 'jobs' && <Jobs />}
          {tab === 'more' && <More />}
        </Suspense>
      </main>
      {/* Material 3's navigation bar (80 px, the icon in a 64x32 pill when active, labels always shown), in black and
          white: a hairline on top, grey when not chosen */}
      <nav aria-label="Main" className={`${typing ? 'hidden' : 'flex'} shrink-0 border-t border-line bg-window px-1
        pb-[var(--bottom)]`}>
        {TABS.map(([id, label, Icon]) => {
          const on = tab === id
          return (
            <button key={id} onClick={() => open(id)} aria-current={on ? 'page' : undefined}
              className="flex h-20 min-w-0 flex-1 flex-col items-center justify-center gap-1">
              <span className={`grid h-8 w-16 place-items-center rounded-full transition-colors
                ${on ? 'bg-pressed text-text' : 'text-dim'}`}>
                <Icon size={24} strokeWidth={on ? 2.25 : 1.75} /></span>
              <span className={`max-w-full truncate text-xs ${on ? 'font-semibold text-text' : 'font-medium text-dim'}`}>
                {label}</span>
            </button>
          )
        })}
      </nav>
    </div>
  )
}

export default function App() {
  return (
    <ToastProvider>
      <NavProvider first={firstPlace()}>
        <Screens />
        <Questions />
        <PhoneWatch />
      </NavProvider>
    </ToastProvider>
  )
}
