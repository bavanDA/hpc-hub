// A page's title bar, the desktop's HeaderBar: the sidebar button, the title (and a cluster chip) in the middle. Old
// pages keep their actions on the right until they are redone.
import { PanelLeft } from 'lucide-react'
import type { ReactNode } from 'react'

import { usePhoneNav } from '../nav'

const BUTTON = 'grid size-10 shrink-0 place-items-center rounded-md text-dim active:bg-pressed active:text-text'

/** chip: <ClusterPicker /> on pages that show one cluster at a time. children: only for pages not redone yet. */
export function Header({ title, chip, children }: { title: string; chip?: ReactNode; children?: ReactNode }) {
  const { setDrawer } = usePhoneNav()
  return (
    <header className="flex h-12 shrink-0 items-center gap-2 border-b border-line bg-header px-2">
      <button aria-label="Show or hide the sidebar" onClick={() => setDrawer(true)} className={BUTTON}>
        <PanelLeft size={16} /></button>
      <div className="flex min-w-0 flex-1 items-center justify-center gap-3">
        <h1 className="truncate text-md font-semibold">{title}</h1>
        {chip}
      </div>
      {children ? <div className="flex shrink-0 items-center">{children}</div> : <span className="size-10 shrink-0" />}
    </header>
  )
}
