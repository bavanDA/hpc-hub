import { useEffect, useState } from 'react'

import { useEvent } from '../../hooks'
import { call } from '../../rpc'
import type { CopyPlan, CopyTargets } from '../../types/projects'
import { defaultTarget, type How } from './copyPlan'

/** Where a project can go and what is in it, loaded once the dialog opens. */
export function useCopyInfo(id: string) {
  const [info, setInfo] = useState<CopyTargets | null>(null)
  const [plan, setPlan] = useState<CopyPlan | null>(null)
  const [planError, setPlanError] = useState('')
  const [to, setTo] = useState('')
  const [how, setHow] = useState<How>('laptop')
  const [keep, setKeep] = useState<Record<string, boolean>>({})
  const [error, setError] = useState('')

  useEffect(() => {
    call<CopyTargets>('projects.copy_targets', { id }).then((t) => {
      const dst = defaultTarget(t)
      setInfo(t)
      setTo(dst?.id ?? '')
      setHow(dst && !dst.globus_missing ? 'globus' : 'laptop')  // faster, and copying again only sends changes
    }).catch((e: Error) => setError(e.message))
    call<CopyPlan>('projects.copy_plan', { id }).then((got) => {
      setPlan(got)
      setKeep(Object.fromEntries(got.parts.map((x) => [x.name, x.keep])))
    }).catch((e: Error) => setPlanError(e.message))
  }, [id])

  useEvent<{ id: string; connected: boolean }>('session', (s) => setInfo((t) => t && {
    ...t, targets: t.targets.map((x) => x.id === s.id ? { ...x, connected: s.connected } : x) }))

  return { info, plan, planError, to, setTo, how, setHow, keep, setKeep, error, setError }
}
