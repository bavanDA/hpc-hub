// The clipboard. In the app it goes through Tauri (WebKit asks before every read); in a browser the web API.
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
