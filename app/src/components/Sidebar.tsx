import { GROUPS, HOME, type Page } from './app/pages'
import { isMac } from './app/platform'
import { SidebarFooter } from './app/SidebarFooter'
import type { Experiments } from './app/types'
import { SidebarLink } from './SidebarLink'

export function Sidebar({ page, onPick, experiments, onSettings, floating = false }: {
  page: Page; onPick: (p: Page) => void; experiments: Experiments; onSettings: () => void; floating?: boolean
}) {
  return (
    <aside className={`flex w-[220px] shrink-0 flex-col border-r border-line bg-window ${
      floating ? 'fixed inset-y-0 left-0 z-40 shadow-[var(--shadow-menu)]' : ''}`}>
      {/* macOS draws its window buttons at the top left, over this row: the name starts after them */}
      <div data-tauri-drag-region className={`flex h-12 shrink-0 items-center text-md font-semibold ${
        isMac ? 'pr-[18px] pl-[84px]' : 'px-[18px]'}`}>
        HPC Hub</div>
      <nav aria-label="Pages" className="flex min-h-0 flex-1 flex-col overflow-y-auto px-1.5 pb-3">
        <SidebarLink item={HOME} page={page} onPick={onPick} />
        {GROUPS.map(([group, items]) => (
          <div key={group} className="flex flex-col">
            <div className="px-3 pt-5 pb-1.5 text-xs font-semibold tracking-wide text-dim uppercase">{group}</div>
            {items.filter((i) => !i.experiment || experiments[i.experiment]).map((i) => (
              <SidebarLink key={i.page} item={i} page={page} onPick={onPick} />
            ))}
          </div>
        ))}
      </nav>
      <SidebarFooter page={page} onPick={onPick} onSettings={onSettings} />
    </aside>
  )
}
