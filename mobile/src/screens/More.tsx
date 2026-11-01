// More: everything that isn't a tab, as a list. Each row opens its screen on top (nav.tsx), with a back arrow.
import {
  ArrowLeftRight, Bot, FileText, FolderOpen, Gauge, Info, LayoutGrid, Settings as Gear, type LucideIcon,
} from 'lucide-react'
import { lazy, Suspense, useEffect, useState, type ComponentType } from 'react'

import { Spinner } from '@shared/components/ui'
import { call } from '@shared/rpc'
import { ScreenBackContext, usePhoneNav, type MoreScreen } from '../nav'
import { Header } from '../parts/Header'
import { Card, ListRow } from '../ui'

const named = <K extends string>(load: () => Promise<Record<K, ComponentType>>, name: K) =>
  lazy(() => load().then((m) => ({ default: m[name] })))

const SCREENS: Record<MoreScreen, ComponentType> = {
  projects: named(() => import('./Projects'), 'Projects'),
  agents: named(() => import('./Agents'), 'Agents'),
  files: named(() => import('./FilesManager'), 'FilesManager'),
  transfers: named(() => import('./Transfers'), 'Transfers'),
  papers: named(() => import('./Papers'), 'Papers'),
  usage: named(() => import('./Usage'), 'Usage'),
  settings: named(() => import('./Settings'), 'Settings'),
  about: named(() => import('./About'), 'About'),
}

type Row = { screen: MoreScreen; title: string; subtitle: string; icon: LucideIcon; experimental?: boolean }

// the desktop sidebar's order: your work, the cluster, data, then the app
const GROUPS: [string, Row[]][] = [
  ['Work', [
    { screen: 'projects', title: 'Projects', subtitle: 'Your folders on every cluster', icon: LayoutGrid },
    { screen: 'agents', title: 'Agents', subtitle: 'Running, scheduled, skills and permissions', icon: Bot },
    { screen: 'papers', title: 'Papers', subtitle: 'LaTeX next to your code', icon: FileText, experimental: true },
  ]],
  ['Cluster', [
    { screen: 'usage', title: 'Usage', subtitle: 'SU left, storage and load', icon: Gauge },
  ]],
  ['Data', [
    { screen: 'files', title: 'Files', subtitle: 'Browse, copy, upload and download', icon: FolderOpen },
    { screen: 'transfers', title: 'Transfers', subtitle: 'Copies between clusters, Globus', icon: ArrowLeftRight },
  ]],
  ['App', [
    { screen: 'settings', title: 'Settings', subtitle: 'Light or dark, terminals', icon: Gear },
    { screen: 'about', title: 'About', subtitle: 'Version and license', icon: Info },
  ]],
]

export function More() {
  const { place, openScreen, closeScreen } = usePhoneNav()
  const [experimental, setExperimental] = useState(false)
  useEffect(() => {
    call<{ experimental: boolean }>('preferences.get').then((p) => setExperimental(p.experimental)).catch(() => {})
  }, [])
  const Screen = place.screen ? SCREENS[place.screen] : null
  if (Screen) {
    return (
      <ScreenBackContext.Provider value={closeScreen}>
        <Suspense fallback={<div className="grid h-full place-items-center"><Spinner size={28} /></div>}>
          <Screen />
        </Suspense>
      </ScreenBackContext.Provider>
    )
  }
  return (
    <div className="flex h-full flex-col">
      <Header title="More" />
      <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-4">
        {GROUPS.map(([group, rows]) => {
          const shown = rows.filter((r) => experimental || !r.experimental)
          return shown.length > 0 && (
            <div key={group} className="mb-5">
              <h2 className="mb-2 text-sm font-bold text-dim">{group}</h2>
              <Card className="py-1">
                {shown.map((r) => (
                  <ListRow key={r.screen} icon={r.icon} title={r.title} subtitle={r.subtitle}
                    onClick={() => openScreen(r.screen)} />
                ))}
              </Card>
            </div>
          )
        })}
      </div>
    </div>
  )
}
