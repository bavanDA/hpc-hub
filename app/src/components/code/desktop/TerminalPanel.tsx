// The terminal panel under the editor, like VS Code's: the open terminal on the left, the list of this folder's
// terminals on the right. They are the Terminals page's tmux sessions, so hiding the panel leaves them running; the
// trash on a row ends one, after asking.
import { ChevronDown, Plus, SquareTerminal, Trash2, X } from 'lucide-react'
import { useEffect, useRef, useState, type ReactNode } from 'react'

import { call } from '../../../rpc'

import type { TmuxSession } from '../../../types/terminals'
import type { Live } from '../../terminals/data'
import { SessionIcon } from '../../terminals/Popover'
import { close, openNew, openSession, setNotify, tabKey, useTabs, type Tab } from '../../terminals/tabs'
import { TerminalView } from '../../terminals/TerminalView'
import { useToast } from '../../toast'
import { AlertDialog, Button, IconButton, Spinner } from '../../ui'
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

  // the trash: an ended terminal just goes; a running one is stopped once you say so
  const [ending, setEnding] = useState<Item | null>(null)
  const end = (it: Item) => {
    if (it.tab && it.tab.ended) {
      close(it.key)
      panel.drop(it.key)
      return
    }
    setEnding(it)
  }
  const stop = (it: Item) => {
    if (it.tab) { close(it.key); panel.drop(it.key) }
    call('terminals.stop', { cluster, session: it.session, node: it.node, kind: it.kind })
      .catch((e: Error) => toast(`Couldn't stop ${it.title}: ${e.message}`, { kind: 'error' }))
      .finally(() => setTimeout(sessions.refresh, 500))
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
  // the list: this folder's terminals, the open ones among them, then ones opened from other folders
  const items: Item[] = [
    ...sessions.here.map((x) => {
      const key = tabKey(cluster, x.name)
      return { key, title: x.title, session: x.name, node: x.node, kind: x.kind, agent: x.agent, s: x,
        tab: mine.find((t) => t.key === key) }
    }),
    ...mine.filter((t) => !sessions.here.some((x) => tabKey(cluster, x.name) === t.key)).map((t) => (
      { key: t.key, title: t.title, session: t.session, node: t.node, kind: t.kind, agent: '', tab: t })),
  ]
  const pick = (it: Item) => (it.tab ? panel.pick(it.key) : it.s && open(it.s))
  let body: ReactNode = null
  if (!on) {
    body = !live ? <Note>Connect to use terminals here.</Note>
      : !listed?.listing && listed?.error ? <Note>{listed.error}</Note>
      : !listed?.listing ? <div className="grid h-full place-items-center"><Spinner /></div>
      : !listed.listing.has_tmux ? <Note>tmux is not installed on this cluster.</Note>
      : items.length ? <Note>Pick a terminal on the right, or start a new one with +.</Note>
      : (
        <div className="flex h-full flex-col items-center justify-center gap-3">
          <span className="text-dim">Nothing running in {name}.</span>
          <Button size="sm" kind="primary" onClick={() => start(Boolean(node))}><Plus size={14} /> New terminal</Button>
        </div>
      )
  }

  return (
    <div ref={box} style={{ height, maxHeight: 'calc(100% - 140px)' }}
      className="relative flex shrink-0 flex-col border-t border-line bg-window">
      <div onPointerDown={drag} role="separator" aria-orientation="horizontal" aria-label="Resize the terminal"
        className="absolute inset-x-0 -top-1 z-10 h-2 cursor-row-resize" />
      <div className="flex h-9 shrink-0 items-center gap-0.5 pr-1">
        <span className="flex-1 truncate px-4 text-xs font-semibold tracking-wide text-dim uppercase">
          {on ? on.title : 'Terminal'}</span>
        <IconButton icon={Plus} label={`New terminal in ${name}`} small disabled={!live}
          onClick={() => start(Boolean(node))} />
        <Running sessions={sessions} folder={folder} name={name} home={home} node={node} disabled={!live}
          openKeys={openKeys} cluster={cluster} onOpen={open} onNew={start} />
        <IconButton icon={X} label={`Hide (${TOGGLE_KEY})`} small onClick={onHide} />
      </div>
      <div className="flex min-h-0 flex-1">
        <div className="relative min-w-0 flex-1">
          {mine.map((t) => <TerminalView key={t.key} tab={t} shown={t.key === on?.key} />)}
          {body}
        </div>
        {items.length > 0 && (
          <div role="tablist" aria-orientation="vertical" className="flex w-[220px] shrink-0 flex-col gap-0.5
            overflow-y-auto border-l border-line p-1.5">
            {items.map((it) => {
              const sel = it.key === on?.key
              return (
                <div key={it.key} role="tab" aria-selected={sel} title={it.s ? about(it.s, folder, home) : it.title}
                  onClick={() => pick(it)}
                  className={`group flex h-8 shrink-0 cursor-pointer items-center gap-2 rounded-md pr-1 pl-2 text-sm ${
                    sel ? 'bg-selected text-text' : 'text-dim hover:bg-hover hover:text-text'}`}>
                  <SessionIcon agent={it.agent} session={it.session} size={14} />
                  <span className={`min-w-0 flex-1 truncate ${it.tab?.ended ? 'line-through' : ''}`}>{it.title}</span>
                  <span className="text-xs text-faint group-hover:hidden">{it.node || 'login'}</span>
                  <button type="button" aria-label={`End ${it.title}`} title="End terminal"
                    onClick={(e) => { e.stopPropagation(); end(it) }}
                    className="hidden size-6 shrink-0 place-items-center rounded text-dim group-hover:grid
                      hover:bg-hover hover:text-bad"><Trash2 size={14} /></button>
                </div>
              )
            })}
          </div>
        )}
      </div>
      {ending && (
        <AlertDialog title={`End ${ending.title}?`} keep="Cancel" act="End terminal"
          onClose={() => setEnding(null)} onAct={() => { const it = ending; setEnding(null); stop(it) }}>
          <p>What is running in it stops, and its history is gone. Hiding the panel keeps it running instead.</p>
        </AlertDialog>
      )}
    </div>
  )
}

/** One row of the list: a running session of this folder, an open terminal, or both. */
type Item = { key: string; title: string; session: string; node: string; kind: 'tmux' | 'screen'; agent: string
  s?: TmuxSession; tab?: Tab }

function Note({ children }: { children: ReactNode }) {
  return <p className="grid h-full place-items-center px-4 text-center text-dim">{children}</p>
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
