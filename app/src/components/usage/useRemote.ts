import { useEffect, useState } from 'react'

import { call } from '../../rpc'

/** One backend call, rerun when params or tick change; null params: no call. */
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
