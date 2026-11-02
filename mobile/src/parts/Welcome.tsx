// The phone's first start: which clusters do you use (setup.choose), then the sign-in of each one that has none yet.
// The easy way is the desktop's QR code ("Scan from your computer"); typing it works too, and so does doing it later.
import { Check, ScanQrCode } from 'lucide-react'
import { useState } from 'react'

import type { SetupStatus } from '@shared/components/app/Welcome'
import { copy } from '@shared/components/clusters/loginCopy'
import { useClusters } from '@shared/components/clusters/store'
import { call } from '@shared/rpc'
import type { Logins } from '@shared/types/clusters'
import { Button, List, MainButton, useToast } from '../ui'
import { LoginSheet, usesKey } from './LoginSheet'
import { scanPairing } from './scanPairing'

export function Welcome({ status, onDone }: { status: SetupStatus; onDone: () => void }) {
  const toast = useToast()
  const { clusters } = useClusters()
  const [picked, setPicked] = useState<string[]>([])
  const [chosen, setChosen] = useState<string[] | null>(null)
  const [step, setStep] = useState(0)
  const [typing, setTyping] = useState(false)
  const toggle = (id: string) => setPicked((p) => p.includes(id) ? p.filter((x) => x !== id) : [...p, id])

  /** Whether a cluster can sign in already: a username, and a password unless it uses a key. */
  async function ready(id: string) {
    const c = clusters?.find((x) => x.id === id)
    const l = await call<Logins>('clusters.login', { cluster: id }).catch(() => null)
    return !!(c && l?.ssh.username && (l.ssh.password || usesKey(c)))
  }

  async function choose() {
    try {
      const s = await call<SetupStatus>('setup.choose', { ids: status.choices.map((c) => c.id).filter((id) => picked.includes(id)) })
      const done = await Promise.all(s.chosen.map(ready))
      const left = s.chosen.filter((_, i) => !done[i])
      if (!left.length) { onDone(); return }
      setChosen(left)
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

  const page = 'safe fixed inset-0 z-30 flex flex-col bg-window'
  if (chosen && id) {
    return (
      <div className={page}>
        <div className="px-4 pt-6">
          {chosen.length > 1 && <p className="text-sm text-dim">Cluster {step + 1} of {chosen.length}</p>}
          <h1 className="mt-1 text-2xl leading-tight font-semibold">{choice ? copy.signIn(choice) : ''}</h1>
          <p className="mt-2 text-dim">On your computer, open HPC Hub's menu, then Set up the phone app, and scan the code
            it shows.</p>
        </div>
        <div className="flex-1" />
        <div className="flex flex-col gap-3 px-4 pb-4">
          <MainButton icon={ScanQrCode} onClick={scan}>Scan from your computer</MainButton>
          <Button disabled={!cluster} onClick={() => setTyping(true)}>Type it instead</Button>
          <Button kind="quiet" className="text-dim" onClick={nextStep}>{copy.skip}</Button>
        </div>
        {typing && cluster && <LoginSheet cluster={cluster} onClose={() => { setTyping(false); nextStep() }} />}
      </div>
    )
  }

  return (
    <div className={page}>
      <div className="px-4 pt-6 pb-5">
        <h1 className="text-2xl leading-tight font-semibold">Welcome to HPC Hub</h1>
        <p className="mt-2 text-dim">Which clusters do you use?</p>
      </div>
      <List>
        {status.choices.map((c) => {
          const on = picked.includes(c.id)
          return (
            <button key={c.id} onClick={() => toggle(c.id)} aria-pressed={on}
              className="flex min-h-14 w-full items-center gap-3 border-b border-line px-4 py-2 text-left text-base
                active:bg-pressed">
              <span className={`min-w-0 flex-1 break-words ${on ? 'font-semibold' : ''}`}>{c.name}</span>
              <span className={`grid size-6 shrink-0 place-items-center rounded-full ${on ? 'bg-accent text-on-accent'
                : 'border-[1.5px] border-line-strong'}`}>{on && <Check size={16} strokeWidth={3} />}</span>
            </button>
          )
        })}
      </List>
      <div className="flex-1" />
      <div className="px-4 pb-4">
        <MainButton disabled={!picked.length} onClick={choose}>{copy.continue}</MainButton>
      </div>
    </div>
  )
}
