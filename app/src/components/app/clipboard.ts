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
