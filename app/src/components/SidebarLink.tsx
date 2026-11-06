import type { Item, Page } from './app/pages'

export function SidebarLink({ item, page, onPick }: { item: Item; page: Page; onPick: (p: Page) => void }) {
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
