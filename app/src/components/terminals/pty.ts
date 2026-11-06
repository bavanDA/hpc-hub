import { invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'

import { call, on } from '../../rpc'

export { openLink } from '../app/openLink'  // links from terminals open like every other link

export const inTauri = '__TAURI_INTERNALS__' in window

const CHANNEL = 'hpc-hub-channel'

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

const bytes = (base64: string) => Uint8Array.from(atob(base64), (c) => c.charCodeAt(0))

const ready = inTauri ? Promise.all([
  listen<{ id: number; data: string }>('pty-data', (e) => deliver(e.payload.id, bytes(e.payload.data))),
  listen<{ id: number; code: number }>('pty-exit', (e) => deliver(e.payload.id, { code: e.payload.code })),
]) : Promise.resolve()

on('term-data', (d) => { const p = d as { id: number; data: string }; deliver(-p.id, bytes(p.data)) })
on('term-exit', (d) => { const p = d as { id: number; code: number }; deliver(-p.id, { code: p.code }) })

/** Start argv in a PTY; data and exit get its output and its end. */
export async function ptyOpen(argv: string[], cols: number, rows: number, h: Handlers): Promise<number> {
  let id: number
  if (argv[0] === CHANNEL) {
    id = -(await call<number>('terminals.open_channel', { argv, cols, rows }))
  } else {
    await ready
    id = await invoke<number>('pty_open', { argv, cols, rows })
  }
  handlers.set(id, h)
  for (const item of early.get(id) ?? []) deliver(id, item)
  early.delete(id)
  return id
}

// Keys to a backend terminal go one call at a time (the backend answers calls on several threads), with what
// was typed meanwhile sent together next
const typed = new Map<number, { busy: boolean; pending: string }>()

async function channelWrite(id: number, data: string) {
  const q = typed.get(id) ?? { busy: false, pending: '' }
  typed.set(id, q)
  q.pending += data
  if (q.busy) return
  q.busy = true
  try {
    while (q.pending) {
      const chunk = q.pending
      q.pending = ''
      await call('terminals.write', { id: -id, data: chunk })
    }
  } finally {
    q.busy = false
  }
}

export const ptyWrite = (id: number, data: string) =>
  id < 0 ? channelWrite(id, data) : invoke('pty_write', { id, data })
export const ptyResize = (id: number, cols: number, rows: number) =>
  id < 0 ? call('terminals.resize', { id: -id, cols, rows }) : invoke('pty_resize', { id, cols, rows })

export function ptyClose(id: number) {
  handlers.delete(id)
  closed.add(id)
  typed.delete(id)
  return id < 0 ? call('terminals.close', { id: -id }) : invoke('pty_close', { id })
}
