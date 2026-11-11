// The desktop's sidebar as a drawer, opened from the top left of every page: the same items, order, names and icons
// (components/app/pages.ts), the experimental ones hidden until they are on in Settings, and the desktop's footer
// with the connected clusters and Settings.
import { GROUPS, HOME, type Item, type Page } from '@shared/components/app/pages'
import { SidebarFooter } from '@shared/components/app/SidebarFooter'
import { useBackLayer, usePhoneNav } from '../nav'
import { useExperiments } from './experiments'

function Link({ item, on, onPick }: { item: Item; on: boolean; onPick: (p: Page) => void }) {
  const Icon = item.icon
  return (
    <button onClick={() => onPick(item.page)} aria-current={on ? 'page' : undefined}
      className={`flex h-10 w-full items-center gap-3 rounded-md px-3 text-left ${
        on ? 'bg-selected font-semibold' : 'active:bg-pressed'}`}>
      <Icon size={16} className={on ? '' : 'text-dim'} /><span>{item.title}</span>
    </button>
  )
}

function Panel() {
  const { place, go, setDrawer, setSettings } = usePhoneNav()
  const experiments = useExperiments()
  const close = () => setDrawer(false)
  useBackLayer(close)
  const pick = (p: Page) => { close(); go(p) }
  const openSettings = () => { close(); setSettings(true) }
  return (
    <>
      <div className="dialog-scrim fixed inset-0 z-30 bg-scrim" onClick={close} />
      <aside className="drawer-in fixed top-[var(--top)] bottom-[var(--bottom)] left-0 z-40 flex w-[260px] flex-col
        border-r border-line bg-window shadow-[var(--shadow-menu)]">
        <div className="flex h-12 shrink-0 items-center px-[18px] text-md font-semibold">HPC Hub</div>
        <nav aria-label="Pages" className="flex min-h-0 flex-1 flex-col overflow-y-auto px-1.5 pb-3">
          <Link item={HOME} on={place.page === HOME.page} onPick={pick} />
          {GROUPS.map(([group, items]) => (
            <div key={group} className="flex flex-col">
              <div className="px-3 pt-5 pb-1.5 text-xs font-semibold tracking-wide text-dim uppercase">{group}</div>
              {items.filter((i) => !i.experiment || experiments[i.experiment]).map((i) => (
                <Link key={i.page} item={i} on={place.page === i.page} onPick={pick} />
              ))}
            </div>
          ))}
        </nav>
        <div className="phone-drawer-foot"><SidebarFooter page={place.page} onPick={pick} onSettings={openSettings} /></div>
      </aside>
    </>
  )
}

export function Drawer() {
  const { drawer } = usePhoneNav()
  return drawer ? <Panel /> : null
}
