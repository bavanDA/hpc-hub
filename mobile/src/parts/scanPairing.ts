// Scan the desktop's "Set up the phone app" code: its logins are saved on this phone (core/pairing.py). The phone
// shows a one-time code first (pairingCode) that you type on the desktop: the QR code is sealed with it, and only
// this phone's backend, which holds the code in memory, can open it.
import { invoke } from '@tauri-apps/api/core'

import { call } from '@shared/rpc'

/** The code to type on the desktop before scanning, as XXXXX-XXXXX ('' and what went wrong when there is none). */
export async function pairingCode(): Promise<{ code: string; msg: string }> {
  if (!('__TAURI_INTERNALS__' in window)) return { code: '', msg: 'Scanning needs the phone app.' }
  try {
    return { code: (await call<{ code: string }>('pairing.start')).code, msg: '' }
  } catch (e) {
    return { code: '', msg: (e as Error).message }
  }
}

/** After pairingCode: what to tell you ('' when you closed the camera), and the clusters that got a login. */
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
