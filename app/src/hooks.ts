// useCall: data from the backend, with loading and error. useEvent: react to what the backend pushes.
import { useCallback, useEffect, useRef, useState } from 'react'

import { call, on } from './rpc'

export function useCall<T>(method: string, params: Record<string, unknown> = {}, deps: unknown[] = []) {
  const [data, setData] = useState<T | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const key = JSON.stringify(params)
  const reload = useCallback(() => {
    setLoading(true)
    call<T>(method, JSON.parse(key))
      .then((d) => { setData(d); setError('') })
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false))
  }, [method, key])
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(reload, [reload, ...deps])
  return { data, error, loading, reload, setData }
}

export function useEvent<T>(name: string, fn: (data: T) => void) {
  const ref = useRef(fn)
  ref.current = fn
  useEffect(() => on(name, (d) => ref.current(d as T)), [name])
}
