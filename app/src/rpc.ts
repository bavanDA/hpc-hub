// Talks to the Python backend: call() returns a promise for the answer, on() listens to its events.
import { invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'

import { demoCall } from './demo/index'

// In a plain browser (design work) there is no Tauri: answer from demo data
const inTauri = '__TAURI_INTERNALS__' in window

type Waiting = { resolve: (v: unknown) => void; reject: (e: Error) => void }
type Message = { id?: number | null; result?: unknown; error?: { message: string }; method?: string;
  params?: { name: string; data: unknown } }

let next = 1
const waiting = new Map<number, Waiting>()
const listeners = new Map<string, Set<(data: unknown) => void>>()

const ready = inTauri ? listen<string>('rpc', (e) => {
  const m: Message = JSON.parse(e.payload)
  if (m.method === 'event' && m.params) {
    listeners.get(m.params.name)?.forEach((fn) => fn(m.params!.data))
  } else if (typeof m.id === 'number' && waiting.has(m.id)) {
    const w = waiting.get(m.id)!
    waiting.delete(m.id)
    if (m.error) w.reject(new Error(m.error.message))
    else w.resolve(m.result)
  }
}) : Promise.resolve()

export async function call<T>(method: string, params: Record<string, unknown> = {}): Promise<T> {
  if (!inTauri) return demoCall<T>(method, params)
  await ready
  const id = next++
  const answer = new Promise<T>((resolve, reject) => waiting.set(id, { resolve: resolve as (v: unknown) => void, reject }))
  await invoke('rpc_send', { line: JSON.stringify({ jsonrpc: '2.0', id, method, params }) })
  return answer
}

export function on(name: string, fn: (data: unknown) => void): () => void {
  if (!listeners.has(name)) listeners.set(name, new Set())
  listeners.get(name)!.add(fn)
  return () => listeners.get(name)!.delete(fn)
}
