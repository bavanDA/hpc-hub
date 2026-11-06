import { useCallback, useEffect, useState } from 'react'

import { useEvent } from '../../hooks'
import { call } from '../../rpc'
import type { Session } from '../../types'
import type { ScheduleOptions, ScheduleStatus } from '../../types/schedules'

export function useSchedules(cluster: string, connected: boolean) {
  const [list, setList] = useState<ScheduleStatus[] | null>(null)
  const [options, setOptions] = useState<ScheduleOptions | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  useEffect(() => { setList(null); setOptions(null); setError('') }, [cluster])  // another cluster picked

  const load = useCallback(() => {
    if (!cluster || !connected) return
    setLoading(true)
    call<ScheduleStatus[]>('schedules.list', { cluster })
      .then((l) => { setList(l); setError('') })
      .catch((e: Error) => { setList(null); setError(e.message) })
      .finally(() => setLoading(false))
    call<ScheduleOptions>('schedules.options', { cluster }).then(setOptions).catch(() => {})
  }, [cluster, connected])
  useEffect(load, [load])
  useEvent<Session>('session', (s) => { if (s.id === cluster && s.state === 'Connected' && !list) load() })

  return { list, setList, options, error, loading, load }
}
