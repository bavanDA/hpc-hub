import { useCallback, useEffect, useState } from 'react'

import { useEvent } from '../../hooks'
import { call } from '../../rpc'
import type { Session } from '../../types'
import type { SkillList } from '../../types/skills'

export function useSkills(cluster: string, connected: boolean) {
  const [list, setList] = useState<SkillList | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  useEffect(() => { setList(null); setError('') }, [cluster])  // another cluster picked

  const load = useCallback(() => {
    if (!cluster || !connected) return
    setLoading(true)
    call<SkillList>('skills.list', { cluster })
      .then((l) => { setList(l); setError('') })
      .catch((e: Error) => { setList(null); setError(e.message) })
      .finally(() => setLoading(false))
  }, [cluster, connected])
  useEffect(load, [load])
  useEvent<Session>('session', (s) => { if (s.id === cluster && s.state === 'Connected' && !list) load() })

  return { list, error, loading, load }
}
