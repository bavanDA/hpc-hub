import { call } from '../../rpc'
import { noteCaught } from '../report/recent'
import { inTauri } from './platform'

export async function copyText(text: string): Promise<void> {
  if (!inTauri) return navigator.clipboard.writeText(text)
  const { writeText } = await import('@tauri-apps/plugin-clipboard-manager')
  await writeText(text)
}

/** What text the clipboard holds; "" when it holds none or can't be read. */
export async function readText(): Promise<string> {
  try {
    if (!inTauri) return await navigator.clipboard.readText()
    const { readText: read } = await import('@tauri-apps/plugin-clipboard-manager')
    return await read()
  } catch {
    return ''
  }
}

const why = (e: unknown) => (e instanceof Error ? e.message : String(e)) || 'refused'

/** The clipboard's text for a paste, tried three ways: the app's clipboard reader, the window's own (some Linux
 * webviews refuse it, which left a paste with nothing), then the system's tools through the backend (wl-paste, xclip,
 * pbpaste, PowerShell). null when none could read it; then why each failed goes in the app's log, so a bug report
 * shows it. */
export async function readClipboard(): Promise<string | null> {
  const failed: string[] = []
  const app: [string, () => Promise<string>][] = inTauri
    ? [['app', async () => (await import('@tauri-apps/plugin-clipboard-manager')).readText()]] : []
  const ways: [string, () => Promise<string>][] = [
    ...app,
    ['window', () => navigator.clipboard.readText()],
    ...(inTauri ? [['system', () => call<string>('files.clipboard_text')]] as [string, () => Promise<string>][] : []),
  ]
  for (const [name, read] of ways) {
    try {
      return await read()
    } catch (e) {
      failed.push(`${name}: ${why(e)}`)
    }
  }
  noteCaught(`Could not read the clipboard (${failed.join('; ')})`)
  return null
}

/** The clipboard's image as a PNG, or null when it holds none or can't be read. In the app this goes through
 * Tauri (the webviews only let a paste event see images); in a browser, through navigator.clipboard. */
export async function readImage(): Promise<Blob | null> {
  try {
    if (!inTauri) {
      for (const item of await navigator.clipboard.read()) {
        const type = item.types.find((t) => t.startsWith('image/'))
        if (type) return await item.getType(type)
      }
      return null
    }
    const { readImage: read } = await import('@tauri-apps/plugin-clipboard-manager')
    const image = await read()
    const [{ width, height }, rgba] = await Promise.all([image.size(), image.rgba()])
    return await png(rgba, width, height)
  } catch {
    return null
  }
}

function png(rgba: Uint8Array, width: number, height: number): Promise<Blob | null> {
  const canvas = Object.assign(document.createElement('canvas'), { width, height })
  canvas.getContext('2d')?.putImageData(new ImageData(new Uint8ClampedArray(rgba), width, height), 0, 0)
  return new Promise((resolve) => canvas.toBlob(resolve, 'image/png'))
}
