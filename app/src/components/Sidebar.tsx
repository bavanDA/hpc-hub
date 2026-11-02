import {
  ArchiveRestore, Bot, FileCode2, FileText, FolderOpen, Gauge, LayoutGrid, ListChecks, Server, SquareTerminal, type LucideIcon,
} from 'lucide-react'

import { SidebarFooter } from './app/SidebarFooter'

/** The pages in the sidebar. The rest are older names that now open a tab of one of them (App.tsx MOVED). */
export type Page = 'clusters' | 'projects' | 'terminals' | 'code' | 'agents' | 'backup' | 'latex' | 'jobs' | 'usage' |
  'files' |
  'permissions' | 'skills' | 'schedules' | 'globus'

type Item = { page: Page; title: string; icon: LucideIcon; experimental?: boolean }

export const HOME: Item = { page: 'clusters', title: 'Clusters', icon: Server }

export const GROUPS: [string, Item[]][] = [
  ['Work', [
    { page: 'projects', title: 'Projects', icon: LayoutGrid },
    { page: 'terminals', title: 'Terminals', icon: SquareTerminal },
    { page: 'code', title: 'Code', icon: FileCode2 },
    { page: 'agents', title: 'Agents', icon: Bot },
    { page: 'backup', title: 'Backup agent', icon: ArchiveRestore },
    { page: 'latex', title: 'Papers', icon: FileText, experimental: true },
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
      className={`flex h-[38px] items-center gap-3 rounded-md px-3 text-left transition-colors ${
        on ? 'bg-selected font-semibold' : 'hover:bg-hover'}`}>
      <Icon size={16} className={on ? 'text-accent-text' : ''} />
      <span>{item.title}</span>
    </button>
  )
}

export function Sidebar({ page, onPick, experimental, onSettings, floating = false }: {
  page: Page; onPick: (p: Page) => void; experimental: boolean; onSettings: () => void; floating?: boolean
}) {
  return (
    <aside className={`flex w-[220px] shrink-0 flex-col bg-sidebar ${
      floating ? 'fixed inset-y-0 left-0 z-40 shadow-[var(--shadow-dialog)]' : ''}`}>
      <div data-tauri-drag-region className="grid h-12 shrink-0 place-items-center text-md font-semibold">HPC Hub</div>
      <nav aria-label="Pages" className="flex min-h-0 flex-1 flex-col overflow-y-auto px-1.5 pb-3">
        <Link item={HOME} page={page} onPick={onPick} />
        {GROUPS.map(([group, items]) => (
          <div key={group} className="flex flex-col">
            <div className="px-3 pt-4 pb-1 text-xs font-semibold text-dim">{group}</div>
            {items.filter((i) => experimental || !i.experimental).map((i) => (
              <Link key={i.page} item={i} page={page} onPick={onPick} />
            ))}
          </div>
        ))}
      </nav>
      <SidebarFooter page={page} onPick={onPick} onSettings={onSettings} />
    </aside>
  )
}
