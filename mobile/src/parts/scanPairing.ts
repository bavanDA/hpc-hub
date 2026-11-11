// Scan the desktop's "Set up the phone app" code: its logins are saved on this phone (core/pairing.py).
import { invoke } from '@tauri-apps/api/core'

import { call } from '@shared/rpc'

/** What to tell you ('' when you closed the camera), and the clusters that got a login. */
export async function scanPairing(): Promise<{ msg: string; names: string[] }> {
  if (!('__TAURI_INTERNALS__' in window)) return { msg: 'Scanning needs the phone app.', names: [] }
  let text: string
  try {
    text = await invoke<string>('scan_qr')
  } catch (e) {
    const msg = String((e as Error).message ?? e)
    return { msg: /cancelled/i.test(msg) ? '' : msg, names: [] }
  }
  try {
    const names = await call<string[]>('pairing.apply', { code: text })
    return { msg: `Saved the login for ${names.join(', ')}.`, names }
  } catch (e) {
    return { msg: (e as Error).message, names: [] }
  }
}
