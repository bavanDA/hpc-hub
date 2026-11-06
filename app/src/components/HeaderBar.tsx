import { Minus, PanelLeft, Square, X } from 'lucide-react'

import { inTauri, isMac } from './app/platform'
import { HeaderRound } from './HeaderRound'
import { useDrag } from './useDrag'

export async function win(action: 'minimize' | 'toggleMaximize' | 'close' | 'startDragging') {
  if (!inTauri) return
  const { getCurrentWindow } = await import('@tauri-apps/api/window')
  await getCurrentWindow()[action]()
}

/** chip: the cluster picker, on pages that show one cluster at a time. No onSidebar: no sidebar button (Welcome). */
export function HeaderBar({ title, onSidebar, sidebar = false, chip }: {
  title: string; onSidebar?: () => void; sidebar?: boolean; chip?: React.ReactNode
}) {
  const drag = useDrag()
  return (
    <header {...drag}
      className={`flex h-12 shrink-0 items-center gap-2 border-b border-line bg-header px-2 ${
        isMac && !sidebar ? 'pl-[78px]' : ''}`}>
      {onSidebar ? <button onClick={onSidebar} aria-label="Show or hide the sidebar"
        className="grid size-8 place-items-center rounded-md text-dim hover:bg-hover hover:text-text">
        <PanelLeft size={16} /></button>
        : <span className="size-8" />}
      <div data-drag className="flex min-w-0 flex-1 items-center justify-center gap-3">
        <span data-drag className="truncate text-md font-semibold">{title}</span>
        {chip}
      </div>
      {!isMac && (
        <div className="ml-1 flex gap-1 pr-1">
          <HeaderRound label="Minimize" onClick={() => win('minimize')}><Minus size={14} strokeWidth={2.5} /></HeaderRound>
          <HeaderRound label="Maximize" onClick={() => win('toggleMaximize')}><Square size={14} strokeWidth={2.5} /></HeaderRound>
          <HeaderRound label="Close" onClick={() => win('close')}><X size={14} strokeWidth={2.5} /></HeaderRound>
        </div>
      )}
    </header>
  )
}
