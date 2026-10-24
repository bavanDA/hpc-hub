// The Open button on a connected card: VS Code, Files, then the agents (hpc_hub/ui/widgets.py open_menu).
import { Bot, ChevronDown, Code, Folder, Globe, LayoutGrid, Users, type LucideIcon } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'

import { useToast } from '../toast'
import { useTools } from '../tools/useTools'

const GROUPS: [string, string, LucideIcon][][] = [
  [['vscode:desktop', 'VS Code app', Code], ['vscode:browser', 'VS Code in browser', Globe],
    ['files', 'Files', Folder]],
  [['ask', 'Ask all agents', Users], ['agent:claude', 'Claude', Bot], ['agent:codex', 'ChatGPT', Bot],
    ['agent:agy', 'Antigravity', Bot], ['agent:cursor', 'Cursor', Bot]],
]

export function OpenMenu({ onOpen, cluster }:
  { onOpen?: (key: string) => void; cluster?: { id: string; name: string } }) {
  const toast = useToast()
  const tools = useTools()
  const [open, setOpen] = useState(false)
  const box = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const away = (e: MouseEvent) => !box.current?.contains(e.target as Node) && setOpen(false)
    const key = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    window.addEventListener('mousedown', away)
    window.addEventListener('keydown', key)
    return () => { window.removeEventListener('mousedown', away); window.removeEventListener('keydown', key) }
  }, [open])

  function pick(key: string) {
    setOpen(false)
    if (onOpen) onOpen(key)
    else if (cluster) tools.open(cluster.id, cluster.name, key)
    else toast('Coming soon')
  }

  return (
    <div ref={box} className="relative w-fit">
      <button onClick={() => setOpen(!open)} title="VS Code, Claude and more" aria-expanded={open}
        className={`flex h-9 items-center gap-2 rounded-md px-3 font-bold hover:bg-selected ${
          open ? 'bg-selected' : 'bg-pill'}`}>
        <LayoutGrid size={14} /> Open <ChevronDown size={14} />
      </button>
      {open && (
        <div role="menu" className="absolute left-0 top-full z-30 mt-1.5 min-w-[220px] rounded-xl bg-card p-1
          shadow-[0_0_0_1px_var(--color-line),0_6px_20px_rgb(0_0_0/0.25)]">
          {GROUPS.map((group, n) => (
            <div key={n} className={n ? 'mt-1 border-t border-line pt-1' : ''}>
              {group.map(([key, label, Icon]) => (
                <button key={key} role="menuitem" onClick={() => pick(key)}
                  className="flex h-9 w-full items-center gap-3 rounded-md px-3 text-left hover:bg-hover">
                  <Icon size={16} /> {label}
                </button>
              ))}
            </div>
          ))}
        </div>
      )}
      {tools.dialog}
    </div>
  )
}
