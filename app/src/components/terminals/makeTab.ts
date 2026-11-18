import { FitAddon } from '@xterm/addon-fit'
import { Terminal } from '@xterm/xterm'

import { openLink } from '../app/openLink'
import { tabNotify } from './tabNotify'
import { linksAt } from './wrappedLinks'
import type { Tab } from './tabs'
import { clipboardKeys, theme } from './xterm'

type Fields = Pick<Tab, 'cluster' | 'session' | 'kind' | 'node' | 'title' | 'color'>

export function makeTab(key: string, fields: Fields): Tab {
  const term = new Terminal({
    fontFamily: '"Adwaita Mono", "Source Code Pro", "DejaVu Sans Mono", Menlo, Consolas, monospace',
    fontSize: 14, scrollback: 20000, cursorBlink: true, theme: theme(),
    windowsPty: navigator.userAgent.includes('Windows') ? { backend: 'conpty' } : undefined,
  })
  const fit = new FitAddon()
  term.loadAddon(fit)
  // links, also ones drawn over several rows (Claude's login link): wrappedLinks.ts
  term.registerLinkProvider({
    provideLinks(line, done) {
      const buf = term.buffer.active
      const row = (i: number) => buf.getLine(i)?.translateToString(false)
      done(linksAt(row, term.cols, line - 1).map((f) => ({
        text: f.url,
        range: { start: { x: f.start.x, y: f.start.y + 1 }, end: { x: f.end.x, y: f.end.y + 1 } },
        decorations: { underline: true, pointerCursor: true },
        activate: () => { void openLink(f.url) },
      })))
    },
  })
  const el = document.createElement('div')
  el.className = 'h-full w-full'
  const tab: Tab = { key, ...fields, term, fit, el, argv: null, pty: null, ended: false, error: '', banners: [],
    lost: '', waiting: false, input: [], seen: new Set() }
  clipboardKeys(tab, tabNotify)
  return tab
}
