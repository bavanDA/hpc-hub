import { ChevronDown, Folder, FolderOpen, House, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'

import type { Project } from '../../../types/projects'
import { MenuGroup as Group } from './MenuGroup'
import { MenuItem as Item } from './MenuItem'
import { tilde } from './paths'

/** The open folder's name over the tree; a click switches to a project or a recent folder, or closes it. */
export function Switcher({ name, open, home, projects, recent, onOpen, onBrowse, onClose }: {
  name: string                     // what the button says
  open: string                     // the open folder, '' for none
  home: string
  projects: Project[]
  recent: string[]
  onOpen: (path: string) => void
  onBrowse: () => void
  onClose?: () => void             // left out when nothing is open
}) {
  const [shown, setShown] = useState(false)
  const box = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!shown) return
    const away = (e: MouseEvent) => !box.current?.contains(e.target as Node) && setShown(false)
    const key = (e: KeyboardEvent) => e.key === 'Escape' && setShown(false)
    window.addEventListener('mousedown', away)
    window.addEventListener('keydown', key)
    return () => { window.removeEventListener('mousedown', away); window.removeEventListener('keydown', key) }
  }, [shown])
  const pick = (fn: () => void) => () => { setShown(false); fn() }

  return (
    <div ref={box} className="relative min-w-0 flex-1">
      <button type="button" onClick={() => setShown(!shown)} aria-haspopup="menu" aria-expanded={shown}
        title={open || 'Open a project or a folder'}
        className={`flex h-7 max-w-full items-center gap-1 rounded-md px-2 text-sm font-semibold transition-colors
          duration-90 ${shown ? 'bg-selected' : 'hover:bg-hover'}`}>
        <span className="truncate">{name}</span>
        <ChevronDown size={14} className="shrink-0 text-dim" />
      </button>
      {shown && (
        <div role="menu" className="menu-in absolute top-full left-0 z-30 mt-1 max-h-[70vh] w-[300px] overflow-y-auto
          rounded-lg bg-raised py-1 shadow-[var(--shadow-menu)]">
          {projects.length > 0 && <Group title="Projects">
            {projects.map((p) => (
              <Item key={p.id} icon={Folder} label={p.name} sub={tilde(p.path, home)} on={p.path === open}
                onClick={pick(() => onOpen(p.path))} />
            ))}
          </Group>}
          <Group title="Folders" line={projects.length > 0}>
            {home && <Item icon={House} label="Home folder" on={home === open} onClick={pick(() => onOpen(home))} />}
            {recent.map((p) => (
              <Item key={p} icon={Folder} label={p.split('/').filter(Boolean).pop() ?? p} sub={tilde(p, home)}
                on={p === open} onClick={pick(() => onOpen(p))} />
            ))}
            <Item icon={FolderOpen} label="Open folder…" onClick={pick(onBrowse)} />
          </Group>
          {onClose && <Group line>
            <Item icon={X} label="Close project" onClick={pick(onClose)} />
          </Group>}
        </div>
      )}
    </div>
  )
}
