// The terminal panel under the editor, like VS Code's: the cluster's terminals running in the open folder first, new
// ones started there. They are the Terminals page's tmux sessions, so closing a tab here leaves them running.
import { ChevronDown, Plus, SquareTerminal, X } from 'lucide-react'
import { useEffect, useRef, useState, type ReactNode } from 'react'

import type { TmuxSession } from '../../../types/terminals'
import type { Live } from '../../terminals/data'
import { SessionIcon } from '../../terminals/Popover'
import { close, openNew, openSession, setNotify, tabKey, useTabs } from '../../terminals/tabs'
import { TerminalView } from '../../terminals/TerminalView'
import { useToast } from '../../toast'
import { Button, IconButton, Spinner } from '../../ui'
import { about, TOGGLE_KEY, usePanelTabs, type FolderSessions } from './panel'

const MIN = 120

export function TerminalPanel({ cluster, live, folder, name, home, sessions, height, onHeight, onHide }: {
  cluster: string
  live: Live | null           // the cluster, when connected
  folder: string
  name: string                // the folder's name
  home: string
  sessions: FolderSessions
  height: number
  onHeight: (h: number, done: boolean) => void
  onHide: () => void
}) {
  const toast = useToast()
  useEffect(() => setNotify(toast), [toast])
  const { tabs } = useTabs()
  const panel = usePanelTabs(cluster, folder)
  const mine = panel.keys.map((k) => tabs.find((t) => t.key === k)).filter((t) => t !== undefined)
  const on = mine.find((t) => t.key === panel.current) ?? mine[mine.length - 1]

  const open = (s: TmuxSession) => {
    openSession(cluster, s)
    panel.add(tabKey(cluster, s.name))
  }

  const start = (onNode: boolean) => {
    const taken = new Set([...sessions.here.map((s) => s.title), ...mine.map((t) => t.title)])
    let title = name
    for (let n = 2; taken.has(title); n++) title = `${name} ${n}`
    openNew(cluster, { name: title, node: onNode, folder, color: '' })
      .then((key) => { panel.add(key); setTimeout(sessions.refresh, 2000) })
      .catch((e: Error) => toast(`Couldn't open the terminal: ${e.message}`, { kind: 'error' }))
  }
  const node = live?.node ?? ''

  const shut = (key: string) => {
    const t = mine.find((x) => x.key === key)
    close(key)
    panel.drop(key)
    if (t?.session && !t.ended) toast(`${t.title} keeps running`)
  }

  // drag the top edge to make it taller or shorter
  const box = useRef<HTMLDivElement>(null)
  const drag = (e: React.PointerEvent) => {
    e.preventDefault()
    const y0 = e.clientY
    const h0 = height
    const room = (box.current?.parentElement?.clientHeight ?? 600) - 140
    const size = (y: number) => Math.round(Math.max(MIN, Math.min(room, h0 + y0 - y)))
    const move = (m: PointerEvent) => onHeight(size(m.clientY), false)
    const up = (m: PointerEvent) => {
      onHeight(size(m.clientY), true)
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      document.body.style.cursor = ''
    }
    document.body.style.cursor = 'row-resize'
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }

  const openKeys = new Set(mine.map((t) => t.key))
  const listed = sessions.listed
  const here = mine.length ? [] : sessions.here
  let body: ReactNode = null
  if (!mine.length) {
    body = !live ? <Note>Connect to use terminals here.</Note>
      : !listed?.listing && listed?.error ? <Note>{listed.error}</Note>
      : !listed?.listing ? <div className="grid h-full place-items-center"><Spinner /></div>
      : !listed.listing.has_tmux ? <Note>tmux is not installed on this cluster.</Note>
      : here.length ? (
        <div className="h-full overflow-y-auto border-t border-line">
          {here.map((s) => (
            <Line key={s.name} icon={<SessionIcon agent={s.agent} session={s.name} />} title={s.title}
              sub={about(s, folder, home)} onClick={() => open(s)} />
          ))}
          <Line icon={<Plus size={16} className="shrink-0 text-dim" />} title="New terminal"
            onClick={() => start(Boolean(node))} />
        </div>
      ) : (
        <div className="flex h-full flex-col items-center justify-center gap-3">
          <span className="text-dim">Nothing running in {name}.</span>
          <Button size="sm" kind="primary" onClick={() => start(Boolean(node))}><Plus size={14} /> New terminal</Button>
        </div>
      )
  }

  return (
    <div ref={box} style={{ height, maxHeight: 'calc(100% - 140px)' }} className="relative flex shrink-0 flex-col border-t border-line bg-window">
      <div onPointerDown={drag} role="separator" aria-orientation="horizontal" aria-label="Resize the terminal"
        className="absolute inset-x-0 -top-1 z-10 h-2 cursor-row-resize" />
      <div className="flex h-9 shrink-0 items-center gap-0.5 pr-1">
        <div role="tablist" className="flex h-full min-w-0 flex-1 overflow-x-auto">
          {!mine.length && <span className="flex items-center px-4 text-xs font-semibold tracking-wide text-dim
            uppercase">{here.length ? `Running in ${name}` : 'Terminal'}</span>}
          {mine.map((t) => {
            const sel = t.key === on?.key
            return (
              <div key={t.key} role="tab" aria-selected={sel} title={t.session || t.title}
                onClick={() => panel.pick(t.key)} onAuxClick={(e) => { if (e.button === 1) shut(t.key) }}
                className={`group -mb-px flex h-9 max-w-[200px] shrink-0 cursor-pointer items-center gap-1.5 border-b-2
                  pr-1 pl-3 text-sm ${sel ? 'border-accent font-semibold' : 'border-transparent text-dim hover:bg-hover hover:text-text'}`}>
                <SessionIcon session={t.session} size={14} />
                <span className={`truncate ${t.ended ? 'text-dim' : ''}`}>{t.title}</span>
                <button type="button" aria-label={`Close ${t.title}`} title="Close (keeps running)"
                  onClick={(e) => { e.stopPropagation(); shut(t.key) }}
                  className={`grid size-5 shrink-0 place-items-center rounded hover:bg-hover ${sel ? ''
                    : 'opacity-0 group-hover:opacity-100'}`}><X size={13} /></button>
              </div>
            )
          })}
        </div>
        <IconButton icon={Plus} label={`New terminal in ${name}`} small disabled={!live}
          onClick={() => start(Boolean(node))} />
        <Running sessions={sessions} folder={folder} name={name} home={home} node={node} disabled={!live}
          openKeys={openKeys} cluster={cluster} onOpen={open} onNew={start} />
        <IconButton icon={X} label={`Hide (${TOGGLE_KEY})`} small onClick={onHide} />
      </div>
      <div className="relative min-h-0 flex-1">
        {mine.map((t) => <TerminalView key={t.key} tab={t} shown={t.key === on?.key} />)}
        {body}
      </div>
    </div>
  )
}

function Note({ children }: { children: ReactNode }) {
  return <p className="grid h-full place-items-center px-4 text-center text-dim">{children}</p>
}

function Line({ icon, title, sub, onClick }: { icon: ReactNode; title: string; sub?: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick}
      className="flex min-h-11 w-full items-center gap-3 border-b border-line px-4 py-1.5 text-left hover:bg-hover
        active:bg-pressed">
      {icon}
      <span className="min-w-0 flex-1">
        <span className="block truncate">{title}</span>
        {sub && <span className="block truncate text-sm text-dim">{sub}</span>}
      </span>
    </button>
  )
}

/** The ⌄ menu: the running terminals, this folder's first, and new ones on the node or the login node. */
function Running({ sessions, folder, name, home, node, disabled, openKeys, cluster, onOpen, onNew }: {
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
            {node && <MenuRow onClick={pick(() => onNew(true))}>New terminal on {node}</MenuRow>}
            <MenuRow onClick={pick(() => onNew(false))}>New terminal on the login node</MenuRow>
          </div>
        </div>
      )}
    </>
  )
}

function MenuRow({ children, onClick }: { children: ReactNode; onClick: () => void }) {
  return (
    <button type="button" role="menuitem" onClick={onClick}
      className="flex h-9 w-full items-center gap-3 px-3 text-left hover:bg-hover active:bg-pressed">
      <SquareTerminal size={16} className="shrink-0 text-dim" />{children}</button>
  )
}
