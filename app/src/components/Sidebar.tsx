import {
  AlarmClock, FolderOpen, Gauge, LayoutGrid, ListChecks, Server, Shield, Star, SquareTerminal, ArrowLeftRight,
  FileText, type LucideIcon,
} from 'lucide-react'

export type Page = 'projects' | 'latex' | 'terminals' | 'schedules' | 'skills' | 'permissions' | 'clusters' |
  'jobs' | 'usage' | 'files' | 'globus'

type Item = { page: Page; title: string; icon: LucideIcon; experimental?: boolean }

const GROUPS: [string, Item[]][] = [
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
    <nav className="flex w-56 shrink-0 flex-col gap-4 border-r border-line bg-sidebar px-3 py-4">
      <div className="px-2 text-sm font-semibold">HPC Hub</div>
      {GROUPS.map(([group, items]) => (
        <div key={group} className="flex flex-col gap-0.5">
          <div className="px-2 pb-1 text-xs font-semibold text-muted">{group}</div>
          {items.filter((i) => experimental || !i.experimental).map(({ page: p, title, icon: Icon }) => (
            <button key={p} onClick={() => onPick(p)}
              className={`flex items-center gap-3 rounded-md px-2 py-1.5 text-left text-sm transition-colors ${
                p === page ? 'bg-accent/15 font-medium text-accent' : 'hover:bg-line/60'}`}>
              <Icon size={16} strokeWidth={1.75} />
              {title}
            </button>
          ))}
        </div>
      ))}
    </nav>
  )
}
