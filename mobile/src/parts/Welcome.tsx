// The phone's first start: which clusters do you use (setup.choose), then each one's sign-in. The easy way is the
// desktop's QR code ("Scan from your computer"); typing it works too, and so does doing it later.
import { Check, ScanQrCode, Server } from 'lucide-react'
import { useState } from 'react'

import { university, type SetupStatus } from '@shared/components/app/Welcome'
import { copy } from '@shared/components/clusters/loginCopy'
import { useClusters } from '@shared/components/clusters/store'
import { call } from '@shared/rpc'
import { Button, useToast } from '../ui'
import { LoginSheet } from './LoginSheet'
import { scanPairing } from './scanPairing'

export function Welcome({ status, onDone }: { status: SetupStatus; onDone: () => void }) {
  const toast = useToast()
  const { clusters } = useClusters()
  const [picked, setPicked] = useState<string[]>([])
  const [chosen, setChosen] = useState<string[] | null>(null)
  const [step, setStep] = useState(0)
  const [typing, setTyping] = useState(false)
  const toggle = (id: string) => setPicked((p) => p.includes(id) ? p.filter((x) => x !== id) : [...p, id])

  async function choose() {
    try {
      const s = await call<SetupStatus>('setup.choose', { ids: status.choices.map((c) => c.id).filter((id) => picked.includes(id)) })
      setChosen(s.chosen)
      setStep(0)
    } catch (e) {
      toast((e as Error).message)
    }
  }

  const id = chosen?.[step]
  const cluster = clusters?.find((c) => c.id === id)
  const choice = status.choices.find((c) => c.id === id)
  const nextStep = () => (chosen && step + 1 < chosen.length ? setStep(step + 1) : onDone())

  async function scan() {
    const { msg, names } = await scanPairing()
    if (msg) toast(msg)
    if (!names.length) return
    // one code can carry several clusters: skip the ones it set up
    const done = new Set(status.choices.filter((c) => names.includes(c.name)).map((c) => c.id))
    const rest = (chosen ?? []).slice(step + 1).filter((x) => !done.has(x))
    if (rest.length) { setChosen([...(chosen ?? []).slice(0, step + 1), ...rest]); setStep(step + 1) } else onDone()
  }

  if (chosen && id) {
    return (
      <div className="fixed inset-0 z-30 flex flex-col bg-window px-6 pt-[calc(var(--top)+24px)]">
        <p className="text-sm text-dim">{choice?.name} · {step + 1} of {chosen.length}</p>
        <h1 className="mt-2 text-2xl font-bold">{choice ? copy.signIn(choice) : ''}</h1>
        <p className="mt-2 text-dim">On your computer, open HPC Hub's menu, then Set up the phone app. Then scan the
          code it shows.</p>
        <div className="mt-8 flex flex-col gap-3">
          <Button kind="primary" icon={ScanQrCode} onClick={scan}>Scan from your computer</Button>
          <Button disabled={!cluster} onClick={() => setTyping(true)}>Type it instead</Button>
        </div>
        <div className="flex-1" />
        <button onClick={nextStep} className="mb-[calc(var(--bottom)+16px)] h-12 self-start font-semibold text-dim">
          {copy.skip}</button>
        {typing && cluster && <LoginSheet cluster={cluster} onClose={() => { setTyping(false); nextStep() }} />}
      </div>
    )
  }

  return (
    <div className="fixed inset-0 z-30 flex flex-col bg-window px-6 pt-[calc(var(--top)+24px)]">
      <h1 className="text-2xl font-bold">Welcome to HPC Hub</h1>
      <p className="mt-2 text-dim">Which clusters do you use?</p>
      <div className="mt-6 flex flex-col gap-3">
        {status.choices.map((c) => {
          const on = picked.includes(c.id)
          const uni = university(c)
          return (
            <button key={c.id} onClick={() => toggle(c.id)} aria-pressed={on}
              className={`flex min-h-16 items-center gap-4 rounded-2xl p-4 text-left
                ${on ? 'bg-accent/10 ring-2 ring-accent' : 'bg-card shadow-[var(--shadow-card)] active:bg-hover'}`}>
              <span className={`grid size-11 shrink-0 place-items-center rounded-xl ${on ? 'bg-accent text-white'
                : 'bg-pill text-dim'}`}><Server size={22} /></span>
              <span className="min-w-0 flex-1">
                <span className="block text-lg font-bold">{c.name.split(' (')[0]}</span>
                {uni && <span className="block text-sm text-dim">{uni}</span>}
              </span>
              {on && <Check size={22} className="text-accent-text" />}
            </button>
          )
        })}
      </div>
      <div className="flex-1" />
      <Button kind="primary" className="mb-[calc(var(--bottom)+16px)]" disabled={!picked.length} onClick={choose}>
        {copy.continue}</Button>
    </div>
  )
}
