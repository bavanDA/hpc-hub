// The open terminals. They live here, outside React, so they keep running while you look at another page.
import { FitAddon } from '@xterm/addon-fit'
import { WebLinksAddon } from '@xterm/addon-web-links'
import { Terminal } from '@xterm/xterm'
import { useSyncExternalStore } from 'react'

import { call } from '../../rpc'
import type { Command, Link, NewTerminal, TmuxSession } from '../../types/terminals'
import { demoShell } from './demoShell'
import { inTauri, openLink, ptyClose, ptyOpen, ptyResize, ptyWrite } from './pty'
import { clipboardKeys, copyText, theme } from './xterm'

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
}

type State = { tabs: Tab[]; current: string | null }
let state: State = { tabs: [], current: null }
const subscribers = new Set<() => void>()
let notify: (text: string) => void = () => {}
let logs = 0

// Light or dark follows the system, also for terminals already open
window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
  for (const t of state.tabs) t.term.options.theme = theme()
})

function changed(next: Partial<State> = {}) {
  state = { ...state, ...next }
  subscribers.forEach((fn) => fn())
}

export function useTabs(): State {
  return useSyncExternalStore((fn) => { subscribers.add(fn); return () => subscribers.delete(fn) }, () => state)
}

export const tabKey = (cluster: string, session: string) => `${cluster}/${session}`
export const setNotify = (fn: (text: string) => void) => { notify = fn }
export const select = (key: string | null) => changed({ current: key })
export const getTab = (key: string) => state.tabs.find((t) => t.key === key)

function makeTab(key: string, fields: Pick<Tab, 'cluster' | 'session' | 'kind' | 'node' | 'title' | 'color'>): Tab {
  const term = new Terminal({
    fontFamily: '"Adwaita Mono", "Source Code Pro", "DejaVu Sans Mono", Menlo, Consolas, monospace',
    fontSize: 14, scrollback: 20000, cursorBlink: true, theme: theme(),
    windowsPty: navigator.userAgent.includes('Windows') ? { backend: 'conpty' } : undefined,
  })
  const fit = new FitAddon()
  term.loadAddon(fit)
  term.loadAddon(new WebLinksAddon((_e, url) => openLink(url)))
  const el = document.createElement('div')
  el.className = 'h-full w-full'
  const tab: Tab = { key, ...fields, term, fit, el, argv: null, pty: null, ended: false, error: '', banners: [],
    seen: new Set() }
  clipboardKeys(tab, notify)
  return tab
}

function add(tab: Tab) {
  changed({ tabs: [...state.tabs, tab], current: tab.key })
}

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
  const tab = makeTab(tabKey(cluster, c.name), { cluster, session: c.name, kind: 'tmux', node: c.node,
    title: c.title ?? spec.name, color: c.color ?? spec.color })
  add(tab)
  tab.argv = c.argv
  start(tab)
  return tab.key
}

/** Any other command in a tab of its own (VS Code jobs, logs): stays until you close it. */
export function openCommand(title: string, argv: string[], color = '', node = '', cluster = '') {
  const tab = makeTab(`log/${++logs}`, { cluster, session: '', kind: 'tmux', node, title, color })
  add(tab)
  tab.argv = argv
  start(tab)
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
    demoShell(tab, (text) => scan(tab, text))
    return
  }
  let pending: number | undefined
  ptyOpen(argv, term.cols, term.rows, {
    data: (bytes) => {
      term.write(bytes)
      clearTimeout(pending)
      pending = setTimeout(() => scan(tab, screenText(term)), 700)
    },
    exit: () => {
      tab.ended = true
      tab.pty = null
      banner(tab, 'Session ended. Close this tab, or open it again from the list.')
    },
  }).then((id) => {
    if (!state.tabs.includes(tab)) return ptyClose(id)  // closed while it was starting
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
  const tabs = state.tabs.filter((t) => t.key !== key)
  const i = state.tabs.indexOf(tab)
  const current = state.current === key ? (tabs[Math.min(i, tabs.length - 1)]?.key ?? null) : state.current
  changed({ tabs, current })
}

export function update(key: string, fields: Partial<Pick<Tab, 'title' | 'color'>>) {
  const tab = getTab(key)
  if (tab) Object.assign(tab, fields)
  changed()
}

function banner(tab: Tab, text: string, button?: string, action?: () => void) {
  tab.banners = [...tab.banners, { id: `${Date.now()}-${tab.banners.length}`, text, button, action }]
  changed()
}

export function dismiss(tab: Tab, id: string) {
  tab.banners = tab.banners.filter((b) => b.id !== id)
  changed()
}

/** The last few hundred lines, with wrapped lines joined back. */
function screenText(term: Terminal): string {
  const buf = term.buffer.active
  const lines: string[] = []
  for (let y = Math.max(0, buf.length - 300); y < buf.length; y++) {
    const line = buf.getLine(y)
    if (!line) continue
    const text = line.translateToString(true)
    if (line.isWrapped && lines.length) lines[lines.length - 1] += text
    else lines.push(text)
  }
  return lines.join('\n')
}

/** Links the terminal printed (VS Code tunnel, device sign-in...) become banners, once each. */
async function scan(tab: Tab, text: string) {
  if (!/https?:\/\/|pairing\s*code/i.test(text)) return
  let found: Link[]
  try {
    found = await call<Link[]>('terminals.links', { text, node: tab.node })
  } catch {
    return
  }
  for (const link of found) {
    const id = link.url + link.code
    if (tab.seen.has(id)) continue
    tab.seen.add(id)
    if (link.kind === 'tunnel') {
      banner(tab, `VS Code is ready (tunnel ${link.tunnel})`, 'Open in browser', () => openLink(link.url))
    } else if (link.kind === 'device-login') {
      const copied = link.code ? await copyText(link.code) : false
      banner(tab, `Sign in with code ${link.code}${copied ? ' (copied)' : ''}`, 'Open sign-in page',
        () => openLink(link.url))
    } else if (link.kind === 'remote') {
      banner(tab, 'Remote control is on', 'Open', () => openLink(link.url))
    } else if (link.kind === 'pair') {
      banner(tab, `ChatGPT pairing code ${link.code}. In the ChatGPT app: Codex, connect a machine, enter the code.`,
        'Copy code', () => copyText(link.code).then((ok) => notify(ok ? 'Code copied' : 'Could not copy')))
    }
  }
}
