// What only Android can do: pick files, save into Downloads, open or share a file, keep connected in the background.
// The Kotlin side is FilesPlugin.kt and KeepAliveService.kt, reached through mobile/src-tauri/src/phone.rs.
import { invoke } from '@tauri-apps/api/core'

/** A file you picked, copied into the app's cache so the backend can read it. */
export type PickedFile = { name: string; path: string; size: number; mime: string }

/** Where a saved file ended up: a content:// link for openWith/share, and words for a toast. */
export type Saved = { uri: string; place: string }

// Tauri hands errors back as plain strings; screens show error.message
async function native<T>(command: string, args: Record<string, unknown>): Promise<T> {
  try {
    return await invoke<T>(command, args)
  } catch (e) {
    throw new Error(typeof e === 'string' ? e : (e as Error).message ?? String(e))
  }
}

/** Android's file picker: the chosen files, copied into the cache (upload them, then they're deleted). Closing the
 *  picker gives an empty list. */
export async function pickFiles(options: { multiple?: boolean; mime?: string[] } = {}): Promise<PickedFile[]> {
  const r = await native<{ files: PickedFile[] }>('pick_files', { multiple: options.multiple ?? false, mime: options.mime ?? [] })
  return r.files
}

/** Moves a file from the cache into Downloads/HPC Hub (on Android 9 and older you pick where). */
export async function saveToDownloads(cachePath: string, name: string): Promise<Saved> {
  return native<Saved>('save_to_downloads', { path: cachePath, name })
}

/** Opens a file in the app Android picks (a PDF viewer, a gallery): a path in the app's files, or a saved uri. */
export async function openWith(path: string, mime?: string): Promise<void> {
  await native('open_with', { path, mime })
}

/** Android's share sheet, with a file (path or saved uri) or plain text. */
export async function share(what: { path?: string; text?: string; title?: string }): Promise<void> {
  await native('share_file', what)
}

/** Keeps the app's connections alive in the background, with a "Connected to Wulver" notification. Asks for the
 *  notification permission first (Android 13+), so the notification can show. */
export async function keepAlive(on: boolean, text?: string): Promise<void> {
  if (on) {
    const n = await import('@tauri-apps/plugin-notification')
    if (!(await n.isPermissionGranted())) await n.requestPermission()
  }
  await native('keep_alive', { on, text })
}
