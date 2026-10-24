// A file's bytes from a cluster, a few MB at a time (latex.chunk), so big PDFs don't make one huge message.
import { call } from '../../rpc'

type Chunk = { data: string; total: number }

export function fromBase64(text: string): Uint8Array {
  const raw = atob(text)
  const out = new Uint8Array(raw.length)
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i)
  return out
}

/** All of path; onProgress gets 0..1 as pieces arrive. */
export async function readFile(cluster: string, path: string, onProgress?: (done: number) => void):
  Promise<Uint8Array> {
  const parts: Uint8Array[] = []
  let offset = 0, total = Infinity
  while (offset < total) {
    const c = await call<Chunk>('latex.chunk', { cluster, path, offset })
    total = c.total
    const bytes = fromBase64(c.data)
    if (!bytes.length) break
    parts.push(bytes)
    offset += bytes.length
    onProgress?.(Math.min(1, offset / Math.max(1, total)))
  }
  if (parts.length === 1) return parts[0]
  const out = new Uint8Array(offset)
  let at = 0
  for (const p of parts) { out.set(p, at); at += p.length }
  return out
}
