// Copies between clusters: the list the backend keeps, kept fresh by its `transfer` events.
import { useEffect, useRef, useState } from 'react'

import { useEvent } from '../../hooks'
import { call } from '../../rpc'
import type { Transfer } from '../../types/files'
import { useToast } from '../toast'

export function useTransfers(onFinished: (t: Transfer) => void) {
  const toast = useToast()
  const [items, setItems] = useState<Transfer[]>([])
  const known = useRef(new Map<string, boolean>())  // id: finished, to tell when one just ended

  useEffect(() => {
    call<Transfer[]>('files.transfers').then((all) => {
      all.forEach((t) => known.current.set(t.id, t.finished))
      setItems((now) => [...now, ...all.filter((t) => !now.some((x) => x.id === t.id))])
    }).catch(() => {})
  }, [])

  useEvent<Transfer>('transfer', (t) => {
    const was = known.current.get(t.id)
    known.current.set(t.id, t.finished)
    setItems((now) => now.some((x) => x.id === t.id) ? now.map((x) => x.id === t.id ? t : x) : [t, ...now])
    if (t.finished && !was) onFinished(t)
  })

  const x = (t: Transfer) => {
    if (t.finished) setItems((now) => now.filter((i) => i.id !== t.id))
    call('files.cancel_transfer', { id: t.id }).catch((e: Error) => toast(`Cancel failed: ${e.message}`))
  }
  return { items, x }
}
