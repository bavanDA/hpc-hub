// The connected clusters, and which one a screen shows (the first, until you pick another).
import { useEffect, useState } from 'react'

import { load, useClusters } from '@shared/components/clusters/store'

export function useConnected() {
  const { clusters, sessions } = useClusters()
  useEffect(load, [])
  const live = (clusters ?? []).filter((c) => sessions[c.id]?.connected)
  const [picked, setPicked] = useState('')
  const current = live.find((c) => c.id === picked) ?? live[0] ?? null
  return { live, current, session: current ? sessions[current.id] : null, pick: setPicked }
}
