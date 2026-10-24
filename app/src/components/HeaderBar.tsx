// The app draws its own header bar (like GTK's): title, buttons, and the window controls.
import { Menu, Minus, PanelLeft, Square, X } from 'lucide-react'

const inTauri = '__TAURI_INTERNALS__' in window

async function win(action: 'minimize' | 'toggleMaximize' | 'close') {
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

export function HeaderBar({ title, onSidebar }: { title: string; onSidebar: () => void }) {
  return (
    <header data-tauri-drag-region
      className="flex h-12 shrink-0 items-center gap-2 border-b border-line bg-header px-2">
      <button onClick={onSidebar} aria-label="Show or hide the sidebar"
        className="grid size-8 place-items-center rounded-md hover:bg-hover"><PanelLeft size={16} /></button>
      <div data-tauri-drag-region className="flex-1 text-center text-[15px] font-bold">{title}</div>
      <button aria-label="Menu" className="grid size-8 place-items-center rounded-md hover:bg-hover">
        <Menu size={16} />
      </button>
      <div className="ml-2 flex gap-3 pr-1">
        <Round label="Minimize" onClick={() => win('minimize')}><Minus size={12} strokeWidth={2.5} /></Round>
        <Round label="Maximize" onClick={() => win('toggleMaximize')}><Square size={9} strokeWidth={2.5} /></Round>
        <Round label="Close" onClick={() => win('close')}><X size={12} strokeWidth={2.5} /></Round>
      </div>
    </header>
  )
}
