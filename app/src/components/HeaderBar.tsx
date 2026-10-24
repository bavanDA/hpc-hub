// The app draws its own header bar (like GTK's): title, buttons, and the window controls. Drag it to move the
// window, double-click it to maximize. On macOS the system's traffic lights sit at the left instead of our buttons.
import { Minus, PanelLeft, Square, X } from 'lucide-react'
import { useRef } from 'react'

import { AppMenu } from './app/AppMenu'
import { inTauri, isMac } from './app/platform'

async function win(action: 'minimize' | 'toggleMaximize' | 'close' | 'startDragging') {
  if (!inTauri) return
  const { getCurrentWindow } = await import('@tauri-apps/api/window')
  await getCurrentWindow()[action]()
}

function Round({ onClick, children, label }: { onClick: () => void; children: React.ReactNode; label: string }) {
  return (
    <button onClick={onClick} aria-label={label}
      className="grid size-6 place-items-center rounded-full bg-pill text-text hover:bg-selected">
      {children}
    </button>
  )
}

/** Moving starts only once the mouse moves, so a double-click is never eaten by a drag (Linux). */
function useDrag() {
  const armed = useRef(false)
  const bare = (e: React.MouseEvent) => e.target === e.currentTarget || (e.target as HTMLElement).dataset.drag !== undefined
  return {
    onMouseDown: (e: React.MouseEvent) => {
      if (e.button !== 0 || !bare(e)) return
      if (e.detail === 2) { armed.current = false; win('toggleMaximize') } else armed.current = true
    },
    onMouseMove: (e: React.MouseEvent) => {
      if (!armed.current) return
      armed.current = false
      if (e.buttons === 1) win('startDragging')
    },
    onMouseUp: () => { armed.current = false },
  }
}

export function HeaderBar({ title, onSidebar, sidebar, onExperimental }:
  { title: string; onSidebar: () => void; sidebar: boolean; onExperimental: (on: boolean) => void }) {
  const drag = useDrag()
  return (
    <header {...drag}
      className={`flex h-12 shrink-0 items-center gap-2 border-b border-line bg-header px-2 ${
        isMac && !sidebar ? 'pl-[78px]' : ''}`}>
      <button onClick={onSidebar} aria-label="Show or hide the sidebar"
        className="grid size-8 place-items-center rounded-md hover:bg-hover"><PanelLeft size={16} /></button>
      <div data-drag className="flex-1 truncate text-center text-[15px] font-bold">{title}</div>
      <AppMenu onExperimental={onExperimental} />
      {!isMac && (
        <div className="ml-2 flex gap-3 pr-1">
          <Round label="Minimize" onClick={() => win('minimize')}><Minus size={12} strokeWidth={2.5} /></Round>
          <Round label="Maximize" onClick={() => win('toggleMaximize')}><Square size={9} strokeWidth={2.5} /></Round>
          <Round label="Close" onClick={() => win('close')}><X size={12} strokeWidth={2.5} /></Round>
        </div>
      )}
    </header>
  )
}
