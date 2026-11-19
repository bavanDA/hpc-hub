import { useEffect, useRef, useState } from 'react'

import { call } from '../../rpc'
import type { Cluster } from '../../types/clusters'
import { Spinner } from '../ui/Spinner'
import { LoginStep } from './onboarding/LoginStep'
import { Progress } from './onboarding/Progress'
import { setupSteps, type Step } from './onboarding/step'

export function Onboarding({ ids, onDone }: { ids: string[]; onDone: () => void }) {
  const [steps, setSteps] = useState<Step[] | null>(null)
  const [at, setAt] = useState(0)
  const done = useRef(onDone)
  useEffect(() => {
    call<Cluster[]>('clusters.list').then((all) => {
      const found = setupSteps(ids, all)
      if (found.length) setSteps(found)
      else done.current()
    }).catch(() => done.current())
  }, [ids])

  const step = steps?.[at]
  if (!steps || !step) return <div className="grid h-full place-items-center"><Spinner size={24} /></div>
  const next = () => (at + 1 < steps.length ? setAt(at + 1) : onDone())
  return (
    <div className="flex h-full flex-col items-center overflow-auto py-10">
      <div className="flex w-full max-w-[600px] flex-col gap-6">
        <Progress steps={steps} at={at} />
        <LoginStep key={at} cluster={step.cluster} onNext={next} />
      </div>
    </div>
  )
}
