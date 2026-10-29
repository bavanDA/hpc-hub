// Scan the desktop's "Set up the phone app" code: its logins are saved on this phone (core/pairing.py).
import { invoke } from '@tauri-apps/api/core'

import { call } from '@shared/rpc'

/** The message to show: what was saved, or why not. Closing the camera says nothing. */
export async function scanPairing(): Promise<string> {
  let text: string
  try {
    text = await invoke<string>('scan_qr')
  } catch (e) {
    const msg = String((e as Error).message ?? e)
    return /cancelled/i.test(msg) ? '' : msg
  }
  try {
    const names = await call<string[]>('pairing.apply', { code: text })
    return `Saved the login for ${names.join(', ')}.`
  } catch (e) {
    return (e as Error).message
  }
}
