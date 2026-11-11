// The phone app: the desktop's pages, one at a time, picked from the sidebar drawer (parts/Drawer.tsx) that the page's
// header opens. nav.tsx keeps where you are and makes Android's Back close things in order. Page agents: mobile/REDESIGN.md.
import { lazy, Suspense, useEffect, type ComponentType } from 'react'

import { GROUPS, HOME } from '@shared/components/app/pages'
import { setReportPage } from '@shared/components/report/open'
import { DemoCrash, PageBoundary } from '@shared/components/report/PageBoundary'
import { ReportHost } from '@shared/components/report/ReportHost'
import { Spinner } from '@shared/components/ui/Spinner'
import { firstPlace, NavProvider, usePhoneNav, type PhonePage } from './nav'
import { Drawer } from './parts/Drawer'
import { Header } from './parts/Header'
import { useExperiments } from './parts/experiments'
import { Questions } from './parts/Questions'
import { PhoneWatch } from './parts/watchPhone'
import { Clusters } from './screens/Clusters'
import { Settings } from './screens/Settings'
import { Terminals } from './screens/Terminals'
import { BackLayer, ToastProvider } from './ui'

const named = <K extends string>(load: () => Promise<Record<K, ComponentType>>, name: K) =>
  lazy(() => load().then((m) => ({ default: m[name] })))

// each page of the drawer, loaded the first time you open it (Clusters and Terminals are always there; a new page: a
// line here and in nav.tsx PhonePage). Terminals stays mounted below, so open terminals keep running.
const PAGES: Record<Exclude<PhonePage, 'clusters' | 'terminals'>, ComponentType> = {
  projects: named(() => import('./screens/Projects'), 'Projects'),
  code: named(() => import('./screens/Code'), 'Code'),
  agents: named(() => import('./screens/Agents'), 'Agents'),
  latex: named(() => import('./screens/Papers'), 'Papers'),
  jobs: named(() => import('./screens/Jobs'), 'Jobs'),
  usage: named(() => import('./screens/Usage'), 'Usage'),
  files: named(() => import('./screens/Files'), 'Files'),
}

const TITLES: Record<string, string> = Object.fromEntries([HOME, ...GROUPS.flatMap(([, items]) => items)]
  .map((i) => [i.page, i.title]))

function Page() {
  const { place } = usePhoneNav()
  if (place.page === 'clusters') return <Clusters />
  if (place.page === 'terminals') return null
  const Current = PAGES[place.page]
  return <Current />
}

function Screens() {
  const { place, open, settings, setSettings } = usePhoneNav()
  const experiments = useExperiments()
  const hidden = place.page === 'latex' && experiments.read && !experiments.papers
  useEffect(() => { if (hidden) open('clusters') }, [hidden, open])  // Papers while its switch is off
  useEffect(() => setReportPage(place.params.tab ? `${place.page}/${place.params.tab}` : place.page),
    [place.page, place.params.tab])
  const shown = place.page === 'terminals'
  return (
    <div className="flex h-full flex-col pt-[var(--top)] pb-[var(--bottom)]">
      <main className="relative min-h-0 flex-1">
        <Suspense fallback={<div className="grid h-full place-items-center"><Spinner size={28} /></div>}>
          {!hidden && <PageBoundary key={place.page} header={<Header title={TITLES[place.page] ?? ''} />}>
            <DemoCrash /><Page /></PageBoundary>}
          {/* kept mounted: open terminals keep running while you look elsewhere */}
          <div className={shown ? 'h-full' : 'hidden'}><Terminals shown={shown} /></div>
        </Suspense>
      </main>
      <Drawer />
      {settings && <Settings onClose={() => setSettings(false)} />}
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
        {/* the report window, from any error's Report or Settings; Android's Back closes it */}
        <ReportHost wrap={(dialog, close) => <BackLayer onBack={close}>{dialog}</BackLayer>} />
      </NavProvider>
    </ToastProvider>
  )
}
