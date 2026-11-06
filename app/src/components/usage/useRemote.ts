// One backend call that reruns when its params or tick change; null params: don't call (not connected yet).
import { useEffect, useRef, useState } from 'react'

import { call } from '../../rpc'

export function useRemote<T>(method: string, params: Record<string, unknown> | null, tick = 0) {
  const key = params ? JSON.stringify(params) : ''
  const [got, setGot] = useState<{ key: string; tick: number; data: T | null; error: string }>(
    { key: '', tick: 0, data: null, error: '' })
  useEffect(() => {
    if (!key) return
    let live = true
    call<T>(method, JSON.parse(key))
      .then((data) => live && setGot({ key, tick, data, error: '' }))
      .catch((e: Error) => live && setGot({ key, tick, data: null, error: e.message }))
    return () => { live = false }
  }, [method, key, tick])
  const fresh = got.key === key && !!key // a refresh keeps showing the last answer until the new one is in
  const loading = !!key && (!fresh || got.tick !== tick)
  return { data: fresh ? got.data : null, error: fresh ? got.error : '', loading }
}

type Got<T> = { key: string; tick: number; data: T | null; error: string }
export type Answer<T> = { data: T | null; error: string; loading: boolean }

/** The same call for several clusters at once (id -> params), each answer in as it comes. A cluster whose params
 * didn't change isn't asked again when another one joins. fresh: a refresh (tick > 0) adds fresh: true. */
export function useEach<T>(method: string, list: Record<string, Record<string, unknown>>, tick = 0, fresh = false) {
  const key = JSON.stringify(list)
  const [got, setGot] = useState<Record<string, Got<T>>>({})
  const asked = useRef(new Map<string, string>())
  useEffect(() => {
    for (const [id, params] of Object.entries(JSON.parse(key) as Record<string, Record<string, unknown>>)) {
      const p = JSON.stringify(params)
      const want = `${p}|${tick}`
      if (asked.current.get(id) === want) continue
      asked.current.set(id, want)
      const keep = (data: T | null, error: string) => asked.current.get(id) === want
        && setGot((g) => ({ ...g, [id]: { key: p, tick, data, error } }))
      call<T>(method, fresh && tick ? { ...params, fresh: true } : params)
        .then((data) => keep(data, ''))
        .catch((e: Error) => keep(null, e.message))
    }
  }, [method, key, tick, fresh])
  return (id: string): Answer<T> => {
    const g = got[id]
    const ok = !!g && !!list[id] && g.key === JSON.stringify(list[id])
    return { data: ok ? g.data : null, error: ok ? g.error : '', loading: !!list[id] && (!ok || g.tick !== tick) }
  }
}
