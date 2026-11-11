// The phone's first start, the desktop's steps (components/app/Onboarding.tsx): which clusters do you use, then for
// each one its sign-in and its compute node. Sign-in is the phone's: Scan from your computer is the easy way, typing
// it is a tap away, and it can wait.
import { Check, ScanQrCode, Server } from 'lucide-react'
import { useState } from 'react'

import { Heading } from '@shared/components/app/onboarding/Heading'
import { NodeStep } from '@shared/components/app/onboarding/NodeStep'
import { Progress } from '@shared/components/app/onboarding/Progress'
import type { Step } from '@shared/components/app/onboarding/step'
import { university, type SetupStatus } from '@shared/components/app/setup'
import { copy, shortName } from '@shared/components/clusters/loginCopy'
import { QueueWindow } from '@shared/components/clusters/node/QueueDialog'
import { useLogin } from '@shared/components/clusters/useLogin'
import { call } from '@shared/rpc'
import type { Cluster } from '@shared/types/clusters'
import { useBackLayer } from '../nav'
import { Button, MainButton, useToast } from '../ui'
import { LoginForm, useScan } from './clusters/LoginForm'
import { QueueDialog } from './clusters/QueueDialog'

/** The sign-in step: the three ways in, then the form when you pick typing it. */
function LoginStep({ cluster: c, onNext, onScanned }:
  { cluster: Cluster; onNext: () => void; onScanned: (names: string[]) => void }) {
  const login = useLogin(c.id)
  const scan = useScan(onScanned)
  const [typing, setTyping] = useState(false)
  useBackLayer(() => setTyping(false), typing)
  const [works, setWorks] = useState(false)  // the key's login test passed: Continue is the main button
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const keys = !!c.key_page && !login.usePassword
  const typed = !!login.user.trim()
  const ready = keys ? works : typed

  async function save() {
    setBusy(true)
    setError('')
    try {
      await login.save()
      onNext()
    } catch (e) {
      setError((e as Error).message)
      setBusy(false)
    }
  }
  const skip = keys && typed ? save : onNext  // the key is on disk either way, the name you typed is worth keeping

  if (!typing) {
    return (
      <div className="flex flex-1 flex-col gap-5">
        <Heading title={copy.signIn({ ...c, name: shortName(c) })}
          text="On your computer, open HPC Hub's menu, then Set up the phone app, and scan the code it shows." />
        <div className="mt-auto flex flex-col items-center gap-3 px-5 pb-2">
          <MainButton icon={ScanQrCode} onClick={scan}>Scan from your computer</MainButton>
          <Button className="h-11 w-full" onClick={() => setTyping(true)}>Type it instead</Button>
          <Button kind="quiet" className="text-dim" onClick={onNext}>{copy.skip}</Button>
        </div>
      </div>
    )
  }
  return (
    <form className="flex flex-col gap-5" onSubmit={(e) => { e.preventDefault(); if (ready) save() }}>
      <Heading title={copy.signIn({ ...c, name: shortName(c) })} />
      <div><LoginForm cluster={c} login={login} onScanned={onScanned} onTested={setWorks} /></div>
      {error && <p role="alert" className="px-5 font-semibold text-bad">{error}</p>}
      <div className="flex flex-col items-center gap-1 px-5 pt-2">
        <MainButton type="submit" disabled={!ready || busy}>{copy.continue}</MainButton>
        <Button kind="quiet" className="text-dim" onClick={skip}>{copy.skip}</Button>
      </div>
    </form>
  )
}

export function Welcome({ status, onDone }: { status: SetupStatus; onDone: () => void }) {
  const toast = useToast()
  const [picked, setPicked] = useState<string[]>([])
  const [steps, setSteps] = useState<Step[] | null>(null)
  const [at, setAt] = useState(0)
  const toggle = (id: string) => setPicked((p) => p.includes(id) ? p.filter((x) => x !== id) : [...p, id])

  async function choose() {
    try {
      const s = await call<SetupStatus>('setup.choose', { ids: status.choices.map((c) => c.id).filter((id) => picked.includes(id)) })
      const all = await call<Cluster[]>('clusters.list')
      const found = s.chosen.flatMap((id) => {
        const c = all.find((x) => x.id === id)
        return c ? [{ cluster: c, kind: 'login' as const }, { cluster: c, kind: 'node' as const }] : []
      })
      if (found.length) setSteps(found)
      else onDone()
    } catch (e) {
      toast((e as Error).message)
    }
  }

  const step = steps?.[at]
  const next = () => (steps && at + 1 < steps.length ? setAt(at + 1) : onDone())
  // one code can carry several clusters: their sign-in steps are done too
  const scanned = (names: string[]) => {
    const rest = steps!.filter((s, i) => i <= at || s.kind !== 'login' || !names.includes(s.cluster.name))
    if (rest.length > at + 1) { setSteps(rest); setAt(at + 1) } else onDone()
  }

  return (
    <div className="safe fixed inset-0 z-30 flex flex-col bg-window">
      <header className="flex h-12 shrink-0 items-center justify-center border-b border-line bg-header">
        <h1 className="text-md font-semibold">HPC Hub</h1>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {!step ? (
          <div className="flex min-h-full flex-col justify-center gap-7 px-4 pt-12 pb-6">
            <div className="text-center">
              <h2 className="text-2xl font-bold">Welcome to HPC Hub</h2>
              <p className="mt-2 text-dim">Which clusters do you use?</p>
            </div>
            <div className="flex flex-col gap-3">
              {status.choices.map((c) => {
                const on = picked.includes(c.id)
                const uni = university(c)
                return (
                  <button key={c.id} onClick={() => toggle(c.id)} aria-pressed={on}
                    className={`flex w-full items-center gap-3.5 rounded-2xl bg-card p-4 text-left ${on
                      ? 'ring-2 ring-accent' : 'shadow-[0_0_0_1px_var(--color-line)]'}`}>
                    <span className={`grid size-11 shrink-0 place-items-center rounded-xl ${on
                      ? 'bg-accent text-on-accent' : 'bg-pill text-dim'}`}><Server size={20} /></span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-lg leading-[22px] font-semibold">{uni ? shortName(c) : c.name}</span>
                      {uni && <span className="block text-sm text-dim">{uni}</span>}
                    </span>
                    <span className={`grid size-6 shrink-0 place-items-center rounded-full border-2 ${on
                      ? 'border-accent bg-accent text-on-accent' : 'border-line'}`}>
                      {on && <Check size={14} strokeWidth={3} />}</span>
                  </button>
                )
              })}
            </div>
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm text-dim">You can change this later in Settings.</p>
              <Button kind="primary" className="h-11 px-6 text-md" disabled={!picked.length} onClick={choose}>
                {copy.continue}</Button>
            </div>
          </div>
        ) : (
          <div className="flex min-h-full flex-col gap-5 py-6">
            <Progress steps={steps!} at={at} />
            {step.kind === 'login'
              ? <LoginStep key={at} cluster={step.cluster} onNext={next} onScanned={scanned} />
              : <QueueWindow.Provider value={QueueDialog}>
                  <NodeStep key={at} cluster={step.cluster} onNext={next} last={at + 1 === steps!.length} /></QueueWindow.Provider>}
          </div>
        )}
      </div>
    </div>
  )
}
