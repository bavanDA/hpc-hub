// The PTYs in the Tauri side (src-tauri/src/pty.rs): open, type, resize, close, and their output by id.
import { invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'

import { call } from '../../rpc'

export const inTauri = '__TAURI_INTERNALS__' in window

type Handlers = { data: (bytes: Uint8Array) => void; exit: (code: number) => void }
const handlers = new Map<number, Handlers>()
// Output that came before its terminal said hello (pty_open answers after the command already started)
const early = new Map<number, (Uint8Array | { code: number })[]>()
const closed = new Set<number>()

function deliver(id: number, item: Uint8Array | { code: number }) {
  const h = handlers.get(id)
  if (closed.has(id)) {
    if (!(item instanceof Uint8Array)) closed.delete(id)
  } else if (!h) {
    early.set(id, [...(early.get(id) ?? []), item])
  } else if (item instanceof Uint8Array) {
    h.data(item)
  } else {
    handlers.delete(id)
    h.exit(item.code)
  }
}

const ready = inTauri ? Promise.all([
  listen<{ id: number; data: string }>('pty-data', (e) => {
    deliver(e.payload.id, Uint8Array.from(atob(e.payload.data), (c) => c.charCodeAt(0)))
  }),
  listen<{ id: number; code: number }>('pty-exit', (e) => deliver(e.payload.id, { code: e.payload.code })),
]) : Promise.resolve()

/** Start argv in a PTY; data and exit get its output and its end. */
export async function ptyOpen(argv: string[], cols: number, rows: number, h: Handlers): Promise<number> {
  await ready
  const id = await invoke<number>('pty_open', { argv, cols, rows })
  handlers.set(id, h)
  for (const item of early.get(id) ?? []) deliver(id, item)
  early.delete(id)
  return id
}

export const ptyWrite = (id: number, data: string) => invoke('pty_write', { id, data })
export const ptyResize = (id: number, cols: number, rows: number) => invoke('pty_resize', { id, cols, rows })

export function ptyClose(id: number) {
  handlers.delete(id)
  closed.add(id)
  return invoke('pty_close', { id })
}

/** Open a link in your browser (the backend does it in the app). */
export function openLink(url: string) {
  if (inTauri) call('terminals.open_link', { url }).catch(() => {})
  else window.open(url, '_blank', 'noopener')
}
