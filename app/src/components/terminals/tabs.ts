import type { FitAddon } from '@xterm/addon-fit'
import type { Terminal } from '@xterm/xterm'

import { call, on } from '../../rpc'
import type { Session } from '../../types/clusters'
import type { Command, Link, Listing, NewTerminal, TmuxSession } from '../../types/terminals'
import { inTauri } from '../app/platform'
import { clusterLabel, isConnected } from '../clusters/store'
import { banner, dismiss } from './banners'
import { demoShell } from './demoShell'
import { dropHistory } from './history/view'
import { makeTab } from './makeTab'
import { ptyClose, ptyOpen, ptyResize, ptyWrite } from './pty'
import { nextStep } from './reattach'
import { scanLinks } from './scanLinks'
import { screenText } from './screenText'
import { nextCurrent, tabKey } from './tabKey'
import { changed, getState, getTab, select } from './tabStore'

export type Banner = { id: string; text: string; button?: string; action?: () => void; cluster?: string }

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
  lost: string  // id of the banner about its lost connection
  waiting: boolean  // attaches again when its cluster signs in
  input: { dispose: () => void }[]  // the keyboard and resize hooks of the running PTY
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

function lostNote(tab: Tab, text: string, button?: string, action?: () => void, cluster?: string) {
  if (tab.lost) dismiss(tab, tab.lost)
  banner(tab, text, button, action)
  const note = tab.banners[tab.banners.length - 1]
  note.cluster = cluster
  tab.lost = note.id
  changed()
}

function attachAgain(tab: Tab, node = tab.node) {
  tab.ended = false
  tab.error = ''
  tab.waiting = false
  tab.node = node
  if (tab.lost) dismiss(tab, tab.lost)
  tab.lost = ''
  changed()
  command(tab, { cluster: tab.cluster, session: tab.session, node, kind: tab.kind })
}

const stillOpen = (tab: Tab) => getState().tabs.includes(tab) && tab.pty === null && tab.ended

/** Its connection ended: the cluster gone (wait for it), or only this tab (attach), or the session is over. */
async function afterExit(tab: Tab, code: number, ranFor: number, tries = 6) {
  const listing = await call<Listing>('terminals.list', { cluster: tab.cluster }).catch(() => null)
  if (!stillOpen(tab)) return
  if (!listing && tries > 0 && isConnected(tab.cluster)) {  // the app hasn't noticed the lost link yet
    setTimeout(() => void afterExit(tab, code, ranFor, tries - 1), 5000)
    return
  }
  const found = listing?.sessions.find((s) => s.name === tab.session)
  const step = nextStep(listing !== null, !!found, code, ranFor)
  if (step === 'attach') return attachAgain(tab, found?.node)
  if (step === 'gone') return lostNote(tab, 'This session has ended. Close this tab, or start a new one from the list.')
  if (step === 'offer') {
    return lostNote(tab, 'You left this session. It is still running.', 'Attach again', () => attachAgain(tab, found?.node))
  }
  tab.waiting = true
  const name = clusterLabel(tab.cluster)
  lostNote(tab, `${name} disconnected. Your session should still be running there.`, `Reconnect to ${name}`, undefined,
    tab.cluster)
}

on('session', (d) => {
  const s = d as Session
  if (!s.connected) return
  for (const tab of getState().tabs) {
    if (tab.cluster === s.id && tab.waiting) {
      tab.waiting = false
      void afterExit(tab, 255, Infinity)  // the session may have ended while it was away
    }
  }
})

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
  const began = Date.now()
  ptyOpen(argv, term.cols, term.rows, {
    data: (bytes) => {
      term.write(bytes)
      clearTimeout(pending)
      pending = setTimeout(() => scanLinks(tab, screenText(term.buffer.active)), 700)
    },
    exit: (code) => {
      tab.ended = true
      tab.pty = null
      tab.input.splice(0).forEach((h) => h.dispose())
      if (!tab.session) return banner(tab, 'Session ended. Close this tab, or open it again from the list.')
      lostNote(tab, 'Connection ended. Checking this session…')
      void afterExit(tab, code, Date.now() - began)
    },
  }).then((id) => {
    if (!getState().tabs.includes(tab)) return ptyClose(id)  // closed while it was starting
    if (tab.ended) return  // it ended before ptyOpen answered
    tab.pty = id
    tab.input = [
      term.onData((d) => { if (tab.pty !== null) ptyWrite(tab.pty, d).catch(() => {}) }),
      term.onResize(({ cols, rows }) => { if (tab.pty !== null) ptyResize(tab.pty, cols, rows).catch(() => {}) }),
    ]
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
  dropHistory(key)
  const { tabs, current } = getState()
  changed({ tabs: tabs.filter((t) => t.key !== key), current: nextCurrent(tabs.map((t) => t.key), key, current) })
}

export function update(key: string, fields: Partial<Pick<Tab, 'title' | 'color'>>) {
  const tab = getTab(key)
  if (tab) Object.assign(tab, fields)
  changed()
}
