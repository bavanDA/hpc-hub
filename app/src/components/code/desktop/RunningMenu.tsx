import { ChevronDown } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'

import type { TmuxSession } from '../../../types/terminals'
import { SessionIcon } from '../../terminals/SessionIcon'
import { tabKey } from '../../terminals/tabKey'
import { IconButton } from '../../ui/IconButton'
import { about } from './about'
import type { FolderSessions } from './folderSessions'
import { NewTerminalRow } from './NewTerminalRow'

/** The ⌄ menu: the running terminals, this folder's first, and new ones on the node or the login node. */
export function RunningMenu({ sessions, folder, name, home, node, disabled, openKeys, cluster, onOpen, onNew }: {
  sessions: FolderSessions; folder: string; name: string; home: string; node: string; disabled: boolean
  openKeys: Set<string>; cluster: string; onOpen: (s: TmuxSession) => void; onNew: (onNode: boolean) => void
}) {
  const [at, setAt] = useState<React.CSSProperties | null>(null)
  const button = useRef<HTMLSpanElement>(null)
  const menu = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!at) return
    const away = (e: MouseEvent) => !menu.current?.contains(e.target as Node) &&
      !button.current?.contains(e.target as Node) && setAt(null)
    const key = (e: KeyboardEvent) => e.key === 'Escape' && setAt(null)
    window.addEventListener('mousedown', away)
    window.addEventListener('keydown', key)
    return () => { window.removeEventListener('mousedown', away); window.removeEventListener('keydown', key) }
  }, [at])
  const toggle = () => {
    if (at) return setAt(null)
    sessions.refresh()
    const r = button.current!.getBoundingClientRect()
    const right = window.innerWidth - r.right
    const below = window.innerHeight - r.bottom - 12
    setAt(below >= 280 ? { top: r.bottom + 4, right, maxHeight: below }
      : { bottom: window.innerHeight - r.top + 4, right, maxHeight: r.top - 12 })
  }
  const pick = (fn: () => void) => () => { setAt(null); fn() }
  const row = (s: TmuxSession) => (
    <button key={s.name} type="button" role="menuitem" onClick={pick(() => onOpen(s))}
      className="flex min-h-11 w-full items-center gap-3 px-3 py-1 text-left hover:bg-hover active:bg-pressed">
      <SessionIcon agent={s.agent} session={s.name} />
      <span className="min-w-0 flex-1">
        <span className="block truncate">{s.title}</span>
        <span className="block truncate text-xs text-dim">
          {about(s, folder, home)}{openKeys.has(tabKey(cluster, s.name)) ? ' · open' : ''}</span>
      </span>
    </button>
  )
  const title = (text: string) =>
    <p className="px-3 pt-1.5 pb-1 text-xs font-semibold tracking-wide text-dim uppercase">{text}</p>
  return (
    <>
      <span ref={button}>
        <IconButton icon={ChevronDown} label="Running terminals" small disabled={disabled} onClick={toggle} />
      </span>
      {at && (
        <div ref={menu} role="menu" style={at} className="menu-in fixed z-30 w-[340px] overflow-y-auto rounded-lg
          bg-raised py-1 shadow-[var(--shadow-menu)]">
          {title(`In ${name}`)}
          {sessions.here.length ? sessions.here.map(row)
            : <p className="px-3 pb-2 text-sm text-dim">Nothing running here.</p>}
          {sessions.others.length > 0 && <div className="mt-1 border-t border-line pt-1">
            {title('Other folders')}
            {sessions.others.map(row)}
          </div>}
          <div className="mt-1 border-t border-line pt-1">
            {node && <NewTerminalRow onClick={pick(() => onNew(true))}>New terminal on {node}</NewTerminalRow>}
            <NewTerminalRow onClick={pick(() => onNew(false))}>New terminal on the login node</NewTerminalRow>
          </div>
        </div>
      )}
    </>
  )
}
