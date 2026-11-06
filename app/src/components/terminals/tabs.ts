import type { FitAddon } from '@xterm/addon-fit'
import type { Terminal } from '@xterm/xterm'

import { call } from '../../rpc'
import type { Command, Link, NewTerminal, TmuxSession } from '../../types/terminals'
import { inTauri } from '../app/platform'
import { banner } from './banners'
import { demoShell } from './demoShell'
import { makeTab } from './makeTab'
import { ptyClose, ptyOpen, ptyResize, ptyWrite } from './pty'
import { scanLinks } from './scanLinks'
import { screenText } from './screenText'
import { nextCurrent, tabKey } from './tabKey'
import { changed, getState, getTab, select } from './tabStore'

export type Banner = { id: string; text: string; button?: string; action?: () => void }

export type Tab = {
  key: string  // "<cluster>/<tmux session>", or "log/<n>" for a command that is not a session
  cluster: string
  session: string  // "" for logs
  kind: 'tmux' | 'screen'
  node: string
  title: string
  color: string
  term: Terminal
  fit: FitAddon
  el: HTMLDivElement  // xterm's home; moved into the page while it is shown
  argv: string[] | null
  pty: number | null
  ended: boolean
  error: string
  banners: Banner[]
  seen: Set<string>
  onLink?: (link: Link) => void  // the code that opened it wants its links too (VS Code)
}

let logs = 0

const add = (tab: Tab) => changed({ tabs: [...getState().tabs, tab], current: tab.key })

/** Attach to a session from the list (or show its tab if it is open). */
export function openSession(cluster: string, s: TmuxSession) {
  const key = tabKey(cluster, s.name)
  if (getTab(key)) return select(key)
  const tab = makeTab(key, { cluster, session: s.name, kind: s.kind, node: s.node, title: s.title, color: s.color })
  add(tab)
  command(tab, { cluster, session: s.name, node: s.node, kind: s.kind })
}

/** A new tmux terminal. Answers its tab key once the cluster said its name. */
export async function openNew(cluster: string, spec: NewTerminal): Promise<string> {
  const c = await call<Command>('terminals.command', { cluster, new: spec })
  return openTmux(cluster, { ...c, title: c.title ?? spec.name, color: c.color ?? spec.color })
}

/** A tmux session whose command line the backend made (agents, Ask all), or its tab if it is open. */
export function openTmux(cluster: string, c: Command): string {
  const key = tabKey(cluster, c.name)
  if (getTab(key)) { select(key); return key }
  const tab = makeTab(key, { cluster, session: c.name, kind: 'tmux', node: c.node, title: c.title ?? c.name,
    color: c.color ?? '' })
  add(tab)
  tab.argv = c.argv
  start(tab)
  return key
}

/** Any other command in a tab of its own (VS Code jobs, logs): stays until you close it. Answers its key. */
export function openCommand(title: string, argv: string[], color = '', node = '', cluster = '',
  onLink?: (link: Link) => void): string {
  const tab = makeTab(`log/${++logs}`, { cluster, session: '', kind: 'tmux', node, title, color })
  tab.onLink = onLink
  add(tab)
  tab.argv = argv
  start(tab)
  return tab.key
}

function command(tab: Tab, params: Record<string, unknown>) {
  call<Command>('terminals.command', params)
    .then((c) => { tab.argv = c.argv; start(tab) })
    .catch((e: Error) => fail(tab, e.message))
}

function fail(tab: Tab, text: string) {
  tab.error = text
  tab.ended = true
  tab.term.write(`\r\n\x1b[31m${text}\x1b[0m\r\n`)
  changed()
}

/** Runs the command once the tab is on screen (so its size is known). */
export function start(tab: Tab) {
  if (!tab.argv || tab.pty !== null || !tab.el.isConnected || tab.ended) return
  const argv = tab.argv
  tab.argv = null
  tab.fit.fit()
  const { term } = tab
  if (!inTauri) {
    tab.pty = 0
    demoShell(tab, (text) => scanLinks(tab, text))
    return
  }
  let pending: number | undefined
  ptyOpen(argv, term.cols, term.rows, {
    data: (bytes) => {
      term.write(bytes)
      clearTimeout(pending)
      pending = setTimeout(() => scanLinks(tab, screenText(term.buffer.active)), 700)
    },
    exit: () => {
      tab.ended = true
      tab.pty = null
      banner(tab, 'Session ended. Close this tab, or open it again from the list.')
    },
  }).then((id) => {
    if (!getState().tabs.includes(tab)) return ptyClose(id)  // closed while it was starting
    tab.pty = id
    term.onData((d) => { if (tab.pty !== null) ptyWrite(tab.pty, d).catch(() => {}) })
    term.onResize(({ cols, rows }) => { if (tab.pty !== null) ptyResize(tab.pty, cols, rows).catch(() => {}) })
    changed()
  }).catch((e) => fail(tab, `Could not start the terminal: ${e}`))
}

/** Detach (tmux keeps it running) and forget the tab. */
export function close(key: string) {
  const tab = getTab(key)
  if (!tab) return
  if (tab.pty) ptyClose(tab.pty).catch(() => {})
  tab.pty = null
  tab.term.dispose()
  const { tabs, current } = getState()
  changed({ tabs: tabs.filter((t) => t.key !== key), current: nextCurrent(tabs.map((t) => t.key), key, current) })
}

export function update(key: string, fields: Partial<Pick<Tab, 'title' | 'color'>>) {
  const tab = getTab(key)
  if (tab) Object.assign(tab, fields)
  changed()
}
