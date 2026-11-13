import type { ITheme } from '@xterm/xterm'

import { call } from '../../rpc'
import { copyText as appCopy, readImage } from '../app/clipboard'
import { isDark } from '../../theme'
import { imageIn } from './imageData'
import { pasteImage } from './pasteImage'
import type { Tab } from './tabs'

export function theme(): ITheme {
  return isDark()
    ? { background: '#1d1d20', foreground: '#ffffff', cursor: '#ffffff', selectionBackground: 'rgba(120,174,237,0.35)' }
    : { background: '#ffffff', foreground: '#2e2e33', cursor: '#2e2e33', selectionBackground: 'rgba(53,132,228,0.25)',
      yellow: '#9c6e03', brightYellow: '#b58300', white: '#77767b', brightWhite: '#5e5c64' }
}

// Settings: Select to copy. Read once, then kept up to date by the Settings dialog.
let selectToCopy = true
call<{ select_to_copy: boolean }>('preferences.get').then((p) => { selectToCopy = p.select_to_copy }).catch(() => {})
export const setSelectToCopy = (on: boolean) => { selectToCopy = on }

export async function copyText(text: string): Promise<boolean> {
  try {
    // WebKit drops a web copy that isn't right after a click (select to copy waits 300 ms), so try Tauri's first
    await appCopy(text).catch(() => navigator.clipboard.writeText(text))
    return true
  } catch {
    // Some webviews only allow the old way
    const area = Object.assign(document.createElement('textarea'), { value: text })
    document.body.append(area)
    area.select()
    const ok = document.execCommand('copy')
    area.remove()
    return ok
  }
}

export function copy(tab: Tab, notify: (text: string) => void) {
  if (tab.term.hasSelection()) {
    copyText(tab.term.getSelection()).then((ok) => notify(ok ? 'Copied' : 'Could not copy'))
  } else if (tab.session && tab.kind === 'tmux') {
    copyTmux(tab, notify)
  }
}

export async function paste(tab: Tab, notify: (text: string) => void) {
  const image = await readImage()
  if (image) return pasteImage(tab, image, notify)
  navigator.clipboard.readText()
    .then((text) => text && tab.term.paste(text))
    .catch(() => notify('Could not read the clipboard'))
}

/** A drag inside tmux (mouse on) selects in tmux, not here: its copy buffer has the text. */
function copyTmux(tab: Tab, notify: (text: string) => void) {
  call<string>('terminals.buffer', { cluster: tab.cluster, node: tab.node })
    .then(async (text) => { if (text && await copyText(text)) notify('Copied') })
    .catch(() => {})
}

/** Ctrl+Shift+C and Ctrl+Shift+V; Ctrl+C copies when text is selected (else it interrupts). Selecting copies
 * too when Select to copy is on. */
export function clipboardKeys(tab: Tab, notify: (text: string) => void) {
  const { term } = tab
  term.attachCustomKeyEventHandler((e) => {
    if (e.type !== 'keydown' || !e.ctrlKey || e.altKey || e.metaKey) return true
    const key = e.key.toLowerCase()
    if (key === 'c' && (e.shiftKey || term.hasSelection())) {
      e.preventDefault()
      copy(tab, notify)
      return false
    }
    if (key === 'v' && e.shiftKey) {
      e.preventDefault()
      paste(tab, notify)
      return false
    }
    if (key === 'v' && tab.session) {
      // Ctrl+V: agents paste an image with it, but they look at the cluster's clipboard. So an image on this
      // computer's clipboard goes up as a file; anything else, Ctrl+V goes on to the program as before.
      e.preventDefault()
      void readImage().then((image) => image ? pasteImage(tab, image, notify) : term.input('\x16', true))
      return false
    }
    return true
  })
  // Ctrl+V or the system's paste with an image on the clipboard: before xterm, which only takes text
  tab.el.addEventListener('paste', (e) => {
    const items = [...(e.clipboardData?.items ?? [])].filter((i) => i.kind === 'file')
    const at = imageIn(items)
    const blob = at >= 0 ? items[at].getAsFile() : null
    if (!blob) return
    e.preventDefault()
    e.stopPropagation()
    void pasteImage(tab, blob, notify)
  }, true)
  let pending: number | undefined
  term.onSelectionChange(() => {
    clearTimeout(pending)
    pending = setTimeout(() => selectToCopy && term.hasSelection() && copyText(term.getSelection()), 300)
  })
  let down: { x: number; y: number; shift: boolean } | null = null
  tab.el.addEventListener('mousedown', (e) => { down = e.button === 0 ? { x: e.x, y: e.y, shift: e.shiftKey } : null })
  tab.el.addEventListener('mouseup', (e) => {
    const moved = down && !down.shift && Math.abs(e.x - down.x) + Math.abs(e.y - down.y) > 6
    down = null
    if (moved && tab.session && tab.kind === 'tmux') {
      setTimeout(() => !term.hasSelection() && copyTmux(tab, notify), 250)
    }
  })
}
