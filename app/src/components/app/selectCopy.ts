// Settings: Select to copy everywhere. Highlighting text anywhere in the window copies it, as a terminal does
// (xterm.ts). Text boxes are left out: you select there to type over it, and that shouldn't replace the clipboard.
import { call } from '../../rpc'
import { copyText } from './clipboard'
import { selectedText } from './selectText'

let on = false
call<{ select_everywhere?: boolean }>('preferences.get').then((p) => { on = !!p.select_everywhere }).catch(() => {})
export const setSelectEverywhere = (yes: boolean) => { on = yes }

/** Copies what you highlight, when the setting is on. Once, at start (main.tsx). */
export function installSelectCopy() {
  let last = ''
  document.addEventListener('mouseup', () => {
    if (!on) return
    setTimeout(() => {  // after the click that ends a selection has settled
      const text = selectedText(window.getSelection())
      if (text && text !== last) { last = text; copyText(text).catch(() => {}) }
      if (!text) last = ''
    }, 0)
  })
}
