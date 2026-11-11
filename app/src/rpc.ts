import { invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'

import { inTauri } from './components/app/platform'
import { noteFailure } from './components/report/recent'
import { onDemoEvent } from './demo/events'
import { demoCall } from './demo/index'


type Waiting = { resolve: (v: unknown) => void; reject: (e: Error) => void; method: string }
type Message = { id?: number | null; result?: unknown; error?: { message: string; data?: { ref?: number } };
  method?: string; params?: { name: string; data: unknown } }

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
    if (m.error) {
      noteFailure(w.method, m.error.message, m.error.data?.ref)  // a bug report about it sends its traceback
      w.reject(new Error(m.error.message))
    } else w.resolve(m.result)
  }
}) : Promise.resolve()
if (!inTauri) onDemoEvent((name, data) => listeners.get(name)?.forEach((fn) => fn(data)))

export async function call<T>(method: string, params: Record<string, unknown> = {}): Promise<T> {
  if (!inTauri) {
    return demoCall<T>(method, params).catch((e: Error) => { noteFailure(method, e.message); throw e })
  }
  await ready
  const id = next++
  const answer = new Promise<T>((resolve, reject) =>
    waiting.set(id, { resolve: resolve as (v: unknown) => void, reject, method }))
  await invoke('rpc_send', { line: JSON.stringify({ jsonrpc: '2.0', id, method, params }) })
  return answer
}

export function on(name: string, fn: (data: unknown) => void): () => void {
  if (!listeners.has(name)) listeners.set(name, new Set())
  listeners.get(name)!.add(fn)
  return () => listeners.get(name)!.delete(fn)
}
