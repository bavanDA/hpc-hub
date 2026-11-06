import { useEffect, useState } from 'react'

import { call, on } from '../../rpc'
import type { MonitorStats } from '../../types/terminals'

/** The host's stats while active; the last ones stay while hidden. */
export function useStats(cluster: string, node: string, active: boolean): MonitorStats | null {
  const [stats, setStats] = useState<MonitorStats | null>(null)
  useEffect(() => {
    if (!active) return
    let id: number | null = null
    let stopped = false
    let early: MonitorStats | null = null  // the last stats can come before monitor.watch answers with the id
    const off = on('monitor', (d) => {
      const s = d as MonitorStats
      if (id === null) early = s
      else if (s.id === id) setStats(s)
    })
    call<number>('monitor.watch', { cluster, node }).then((w) => {
      if (stopped) return void call('monitor.unwatch', { id: w }).catch(() => {})
      id = w
      if (early?.id === w) setStats(early)
    }).catch(() => {})  // not connected: the bar waits with dots
    return () => {
      stopped = true
      off()
      if (id !== null) call('monitor.unwatch', { id }).catch(() => {})
    }
  }, [cluster, node, active])
  return stats
}
