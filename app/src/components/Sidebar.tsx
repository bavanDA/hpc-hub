import {
  AlarmClock, ArrowLeftRight, FileText, FolderOpen, Gauge, LayoutGrid, ListChecks, Server, Shield,
  SquareTerminal, Star, type LucideIcon,
} from 'lucide-react'

export type Page = 'projects' | 'latex' | 'terminals' | 'schedules' | 'skills' | 'permissions' | 'clusters' |
  'jobs' | 'usage' | 'files' | 'globus'

type Item = { page: Page; title: string; icon: LucideIcon; experimental?: boolean }

export const GROUPS: [string, Item[]][] = [
  ['Work', [
    { page: 'projects', title: 'Projects', icon: LayoutGrid },
    { page: 'latex', title: 'LaTeX', icon: FileText, experimental: true },
    { page: 'terminals', title: 'Terminals', icon: SquareTerminal },
    { page: 'schedules', title: 'Scheduled agents', icon: AlarmClock, experimental: true },
    { page: 'skills', title: 'Skills', icon: Star, experimental: true },
    { page: 'permissions', title: 'Permissions', icon: Shield },
  ]],
  ['Cluster', [
    { page: 'clusters', title: 'Clusters', icon: Server },
    { page: 'jobs', title: 'Jobs', icon: ListChecks },
    { page: 'usage', title: 'Usage', icon: Gauge },
  ]],
  ['Data', [
    { page: 'files', title: 'Files', icon: FolderOpen },
    { page: 'globus', title: 'Globus', icon: ArrowLeftRight },
  ]],
]

export function Sidebar({ page, onPick, experimental }: { page: Page; onPick: (p: Page) => void; experimental: boolean }) {
  return (
    <aside className="flex w-[220px] shrink-0 flex-col bg-sidebar">
      <div data-tauri-drag-region className="grid h-12 shrink-0 place-items-center text-md font-semibold">HPC Hub</div>
      <nav className="flex flex-col overflow-y-auto px-1.5 pb-3">
        {GROUPS.map(([group, items], n) => (
          <div key={group} className="flex flex-col">
            <div className={`px-3 pb-1 text-sm font-semibold text-dim ${n ? 'pt-4' : 'pt-1'}`}>{group}</div>
            {items.filter((i) => experimental || !i.experimental).map(({ page: p, title, icon: Icon }) => (
              <button key={p} onClick={() => onPick(p)}
                className={`flex h-[38px] items-center gap-3 rounded-md px-3 text-left transition-colors ${
                  p === page ? 'bg-selected' : 'hover:bg-hover'}`}>
                <Icon size={16} strokeWidth={2} />
                <span>{title}</span>
              </button>
            ))}
          </div>
        ))}
      </nav>
    </aside>
  )
}
