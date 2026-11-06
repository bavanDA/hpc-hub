import { useEffect, useSyncExternalStore } from 'react'

import { call } from '../../../../rpc'
import type { AgentChoice, AgentPick } from '../../../../types/history'

let current: AgentChoice | null = null
let loading = false
const subscribers = new Set<() => void>()
const set = (c: AgentChoice) => { current = c; subscribers.forEach((fn) => fn()) }

/** The saved choice, loaded the first time it is asked for; null until then. */
export function useAgentChoice(): AgentChoice | null {
  const c = useSyncExternalStore((fn) => { subscribers.add(fn); return () => { subscribers.delete(fn) } }, () => current)
  useEffect(() => {
    if (current || loading) return
    loading = true
    call<AgentChoice>('latex.agent_choice').then(set).catch(() => {}).finally(() => { loading = false })
  }, [])
  return c
}

/** Keep a change: the agent alone (Settings), or the model, the effort or the split (the paper). */
export async function chooseAgent(p: Partial<AgentPick> & { split?: boolean }): Promise<AgentChoice> {
  const c = await call<AgentChoice>('latex.agent_choose', p)
  set(c)
  return c
}
