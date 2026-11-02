// The ☰ menu in the header (hpc_hub/ui/window.py _menu): Settings, the phone app's QR code, About, and the two ways
// to quit.
// Ctrl+, opens Settings and Ctrl+Q quits, as in the GTK app (Cmd on macOS).
import { Menu } from 'lucide-react'
import { useEffect, useRef, useState, type ReactNode } from 'react'

import { AboutDialog } from './About'
import { PairPhoneDialog } from './PairPhoneDialog'
import { isMac } from './platform'
import { PreferencesDialog } from './Preferences'
import { useQuit } from './quit'

export function AppMenu({ onExperimental }: { onExperimental: (on: boolean) => void }) {
  const [open, setOpen] = useState(false)
  const [dialog, setDialog] = useState<ReactNode>(null)
  const box = useRef<HTMLDivElement>(null)
  const quit = useQuit()
  const close = () => setDialog(null)
  const prefs = () => setDialog(<PreferencesDialog onClose={close} onExperimental={onExperimental} />)

  useEffect(() => {
    const away = (e: MouseEvent) => !box.current?.contains(e.target as Node) && setOpen(false)
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
      if (!(isMac ? e.metaKey : e.ctrlKey) || e.altKey || e.shiftKey) return
      if (e.key === ',') { e.preventDefault(); setOpen(false); prefs() }
      if (e.key.toLowerCase() === 'q') { e.preventDefault(); setOpen(false); quit.quit() }
    }
    window.addEventListener('mousedown', away)
    window.addEventListener('keydown', key)
    return () => { window.removeEventListener('mousedown', away); window.removeEventListener('keydown', key) }
  })

  const items: [string, () => void, string?][][] = [
    [['Settings…', prefs, isMac ? '⌘,' : 'Ctrl+,'], ['Set up the phone app…', () => setDialog(<PairPhoneDialog onClose={close} />)],
      ['About HPC Hub', () => setDialog(<AboutDialog onClose={close} />)]],
    [['Disconnect all and quit…', quit.disconnectAndQuit],
      ['Close HPC Hub (nodes and VPN stay on)', quit.quit, isMac ? '⌘Q' : 'Ctrl+Q']],
  ]
  return (
    <div ref={box} className="relative">
      <button aria-label="Menu" title="Menu" aria-expanded={open} onClick={() => setOpen(!open)}
        className={`grid size-8 place-items-center rounded-md text-dim hover:bg-hover hover:text-text ${
          open ? 'bg-selected text-text' : ''}`}>
        <Menu size={16} />
      </button>
      {open && (
        <div role="menu" className="menu-in absolute right-0 top-full z-30 mt-1.5 min-w-[280px] rounded-lg bg-raised
          py-1 shadow-[var(--shadow-menu)]">
          {items.map((group, n) => (
            <div key={n} className={n ? 'mt-1 border-t border-line pt-1' : ''}>
              {group.map(([label, run, keys]) => (
                <button key={label} role="menuitem" onClick={() => { setOpen(false); run() }}
                  className="flex h-9 w-full items-center gap-6 whitespace-nowrap px-3 text-left hover:bg-hover
                    active:bg-pressed">
                  <span className="flex-1">{label}</span>
                  {keys && <span className="text-sm text-dim">{keys}</span>}
                </button>
              ))}
            </div>
          ))}
        </div>
      )}
      {dialog}
      {quit.dialog}
    </div>
  )
}
