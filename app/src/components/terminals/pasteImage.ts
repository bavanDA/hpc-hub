// Pasting an image into a terminal. Claude, Codex and the rest run on the cluster and can't see this computer's
// clipboard, so the image goes into a file there (~/.hpc-hub/pastes, only you can read it) and the terminal
// gets its path, which the agents attach as an image.
import { call } from '../../rpc'
import { toBase64 } from './imageData'
import type { Tab } from './tabs'

export async function pasteImage(tab: Tab, blob: Blob, notify: (text: string) => void) {
  if (!tab.session) return  // a log is not a shell
  notify('Pasting the image…')
  try {
    const data = await toBase64(blob)
    const path = await call<string>('terminals.paste_image', { cluster: tab.cluster, data, kind: blob.type })
    tab.term.paste(`${path} `)
    tab.term.focus()
  } catch (e) {
    notify(e instanceof Error ? e.message : 'Could not paste the image')
  }
}
