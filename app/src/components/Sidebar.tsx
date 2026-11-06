import { GROUPS, HOME, type Item, type Page } from './app/pages'
import { SidebarFooter } from './app/SidebarFooter'
import type { Experiments } from './app/types'

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
