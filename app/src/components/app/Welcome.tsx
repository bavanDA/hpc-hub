// The first start: which clusters do you use? Only those show up in the app (Settings changes it later).
// Then Onboarding.tsx asks each one's sign-in and compute node.
import { Check, Server } from 'lucide-react'
import { useState } from 'react'

import { call } from '../../rpc'
import { shortName } from '../clusters/loginCopy'
import { Button } from '../ui'

export type Choice = { id: string; name: string; org?: string; host: string; vpn: boolean; second_factor: string }
export type SetupStatus = { first_run: boolean; chosen: string[]; choices: Choice[] }

/** "NJIT" under "Wulver"; nothing when the name says it already ("Yale Bouchet", "SDSC Expanse"). */
export function university(c: Choice): string {
  return c.org && !c.name.includes(c.org) ? c.org : ''
}

export function Welcome({ status, onDone }: { status: SetupStatus; onDone: (chosen: string[]) => void }) {
  const [picked, setPicked] = useState<string[]>([])
  const [error, setError] = useState('')
  const toggle = (id: string) => setPicked((p) => p.includes(id) ? p.filter((x) => x !== id) : [...p, id])
  const go = () => call<SetupStatus>('setup.choose',
    { ids: status.choices.map((c) => c.id).filter((id) => picked.includes(id)) })
    .then((s) => onDone(s.chosen)).catch((e: Error) => setError(e.message))
  return (
    <div className="flex h-full flex-col items-center justify-center gap-8 overflow-auto p-8">
      <div className="text-center">
        <h1 className="text-3xl font-bold">Welcome to HPC Hub</h1>
        <p className="mt-2 text-dim">Which clusters do you use?</p>
      </div>
      <div className="grid w-full max-w-[640px] grid-cols-[repeat(auto-fit,minmax(180px,1fr))] gap-4">
        {status.choices.map((c) => {
          const on = picked.includes(c.id)
          const uni = university(c)
          return (
            <button key={c.id} onClick={() => toggle(c.id)} aria-pressed={on}
              className={`relative flex flex-col items-start gap-4 rounded-2xl p-5 text-left transition
                focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent
                ${on ? 'bg-accent/10 ring-2 ring-accent' : 'bg-card shadow-[var(--shadow-card)] hover:bg-hover'}`}>
              <span className={`grid size-11 place-items-center rounded-xl ${
                on ? 'bg-accent text-white' : 'bg-pill text-accent-text'}`}><Server size={22} /></span>
              <span>
                <span className="block text-lg font-bold leading-tight">{uni ? shortName(c) : c.name}</span>
                <span className="block text-[13px] text-dim">{uni || ' '}</span>
              </span>
              <span className={`absolute right-4 top-4 grid size-6 place-items-center rounded-full border-2 transition ${
                on ? 'border-accent bg-accent text-white' : 'border-line'}`}>{on && <Check size={14} strokeWidth={3} />}</span>
            </button>
          )
        })}
      </div>
      {error && <p className="text-bad">{error}</p>}
      <div className="flex w-full max-w-[640px] items-center justify-between gap-4">
        <p className="text-[13px] text-dim">You can change this later in Settings.</p>
        <Button kind="suggested" round disabled={!picked.length} onClick={go}>Continue</Button>
      </div>
    </div>
  )
}
