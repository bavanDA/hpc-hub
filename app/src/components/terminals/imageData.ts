// The pure parts of pasting an image (pasteImage.ts): which clipboard item is an image the agents take, and its
// bytes as base64.

const TYPES = ['image/png', 'image/jpeg', 'image/gif', 'image/webp']

/** Where the first image is among a paste's or clipboard read's items; -1 when there is none. */
export function imageIn(items: { type: string }[]): number {
  return items.findIndex((i) => TYPES.includes(i.type))
}

/** A Blob as base64, in chunks so a big screenshot doesn't overflow the call stack. */
export async function toBase64(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer())
  let text = ''
  for (let i = 0; i < bytes.length; i += 0x8000) text += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return btoa(text)
}
