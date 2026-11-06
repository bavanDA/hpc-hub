import { inTauri } from '../app/platform'
import { S } from './loginStrings'

/** A private key file from the system's file dialog, starting in ~/.ssh. */
export async function pickKeyFile(): Promise<string | null> {
  if (!inTauri) return '/home/jdoe/.ssh/lab_ed25519'  // design preview
  const { open } = await import('@tauri-apps/plugin-dialog')
  const { homeDir, join } = await import('@tauri-apps/api/path')
  const start = await homeDir().then((h) => join(h, '.ssh')).catch(() => undefined)
  const got = await open({ title: S.PICK_KEY, defaultPath: start, multiple: false, directory: false })
  return typeof got === 'string' ? got : null
}
