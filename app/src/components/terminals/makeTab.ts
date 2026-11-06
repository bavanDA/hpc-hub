import { FitAddon } from '@xterm/addon-fit'
import { WebLinksAddon } from '@xterm/addon-web-links'
import { Terminal } from '@xterm/xterm'

import { openLink } from './pty'
import { tabNotify } from './tabNotify'
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
  term.loadAddon(new WebLinksAddon((_e, url) => openLink(url)))
  const el = document.createElement('div')
  el.className = 'h-full w-full'
  const tab: Tab = { key, ...fields, term, fit, el, argv: null, pty: null, ended: false, error: '', banners: [],
    seen: new Set() }
  clipboardKeys(tab, tabNotify)
  return tab
}
