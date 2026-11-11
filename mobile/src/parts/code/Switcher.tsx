// The open folder's name; tap it to switch to a project or a folder opened before, or to close it. The desktop's
// switcher, whose list also closes with Android's Back.
import { ChevronDown, Folder, FolderOpen, House, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'

import { MenuGroup as Group } from '@shared/components/code/desktop/MenuGroup'
import { MenuItem as Item } from '@shared/components/code/desktop/MenuItem'
import { tilde } from '@shared/components/code/desktop/paths'
import type { Project } from '@shared/types/projects'
import { useBackLayer } from '../../nav'

export function Switcher({ name, open, home, projects, recent, onOpen, onBrowse, onClose }: {
  name: string; open: string; home: string; projects: Project[]; recent: string[]
  onOpen: (path: string) => void; onBrowse: () => void; onClose?: () => void
}) {
  const [shown, setShown] = useState(false)
  const box = useRef<HTMLDivElement>(null)
  useBackLayer(() => setShown(false), shown)
  useEffect(() => {
    if (!shown) return
    const away = (e: MouseEvent) => !box.current?.contains(e.target as Node) && setShown(false)
    window.addEventListener('mousedown', away)
    return () => window.removeEventListener('mousedown', away)
  }, [shown])
  const pick = (fn: () => void) => () => { setShown(false); fn() }

  return (
    <div ref={box} className="relative min-w-0 flex-1">
      <button type="button" onClick={() => setShown(!shown)} aria-haspopup="menu" aria-expanded={shown}
        className={`flex h-8 max-w-full items-center gap-1 rounded-md px-2 font-medium ${shown ? 'bg-selected' : 'active:bg-pressed'}`}>
        <span className="truncate">{name}</span>
        <ChevronDown size={16} className="shrink-0 text-dim" />
      </button>
      {shown && (
        <div role="menu" className="menu-in absolute top-full left-0 z-30 mt-1 max-h-[70vh] w-[280px] overflow-y-auto
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
          {onClose && <Group line><Item icon={X} label="Close project" onClick={pick(onClose)} /></Group>}
        </div>
      )}
    </div>
  )
}
