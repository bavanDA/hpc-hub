import {
  Bot, FileCode2, FileText, FolderOpen, Gauge, LayoutGrid, ListChecks, Server, SquareTerminal, type LucideIcon,
} from 'lucide-react'

import { SidebarFooter } from './app/SidebarFooter'
import type { Experiments } from './app/types'

/** The pages in the sidebar. The rest are older names that now open a tab of one of them (App.tsx MOVED). */
export type Page = 'clusters' | 'projects' | 'terminals' | 'code' | 'agents' | 'backup' | 'latex' | 'jobs' | 'usage' |
  'files' |
  'permissions' | 'skills' | 'schedules' | 'globus'

/** experiment: shown only while that experimental part is on in Settings. */
type Item = { page: Page; title: string; icon: LucideIcon; experiment?: keyof Experiments }

export const HOME: Item = { page: 'clusters', title: 'Clusters', icon: Server }

export const GROUPS: [string, Item[]][] = [
  ['Work', [
    { page: 'projects', title: 'Projects', icon: LayoutGrid },
    { page: 'terminals', title: 'Terminals', icon: SquareTerminal },
    { page: 'code', title: 'Code', icon: FileCode2 },
    { page: 'agents', title: 'Agents', icon: Bot },
    { page: 'latex', title: 'Papers', icon: FileText, experiment: 'papers' },
  ]],
  ['Cluster', [
    { page: 'jobs', title: 'Jobs', icon: ListChecks },
    { page: 'usage', title: 'Usage', icon: Gauge },
  ]],
  ['Data', [
    { page: 'files', title: 'Files', icon: FolderOpen },
  ]],
]

function Link({ item, page, onPick }: { item: Item; page: Page; onPick: (p: Page) => void }) {
  const Icon = item.icon
  const on = item.page === page
  return (
    <button onClick={() => onPick(item.page)} aria-current={on ? 'page' : undefined}
      className={`flex h-9 items-center gap-3 rounded-md px-3 text-left transition-colors ${
        on ? 'bg-selected font-semibold' : 'hover:bg-hover active:bg-pressed'}`}>
      <Icon size={16} className={on ? '' : 'text-dim'} />
      <span>{item.title}</span>
    </button>
  )
}

export function Sidebar({ page, onPick, experiments, onSettings, floating = false }: {
  page: Page; onPick: (p: Page) => void; experiments: Experiments; onSettings: () => void; floating?: boolean
}) {
  return (
    <aside className={`flex w-[220px] shrink-0 flex-col border-r border-line bg-window ${
      floating ? 'fixed inset-y-0 left-0 z-40 shadow-[var(--shadow-menu)]' : ''}`}>
      <div data-tauri-drag-region className="flex h-12 shrink-0 items-center px-[18px] text-md font-semibold">
        HPC Hub</div>
      <nav aria-label="Pages" className="flex min-h-0 flex-1 flex-col overflow-y-auto px-1.5 pb-3">
        <Link item={HOME} page={page} onPick={onPick} />
        {GROUPS.map(([group, items]) => (
          <div key={group} className="flex flex-col">
            <div className="px-3 pt-5 pb-1.5 text-xs font-semibold tracking-wide text-dim uppercase">{group}</div>
            {items.filter((i) => !i.experiment || experiments[i.experiment]).map((i) => (
              <Link key={i.page} item={i} page={page} onPick={onPick} />
            ))}
          </div>
        ))}
      </nav>
      <SidebarFooter page={page} onPick={onPick} onSettings={onSettings} />
    </aside>
  )
}
