// The first start: which clusters do you use? Only those show up in the app (Settings changes it later).
// Then Onboarding.tsx asks each one's login and compute node.
import { Check, Server } from 'lucide-react'
import { useState } from 'react'

import { call } from '../../rpc'
import { Button } from '../ui'

export type Choice = { id: string; name: string; host: string; vpn: boolean; second_factor: string }
export type SetupStatus = { first_run: boolean; chosen: string[]; choices: Choice[] }

export function describe(c: Choice): string {
  const login = c.second_factor === 'code' ? 'a code from your authenticator app' : 'Duo on your phone'
  const how = c.vpn ? `VPN and ${login}` : login.charAt(0).toUpperCase() + login.slice(1)
  return `${c.host} · ${how}`
}

export function Welcome({ status, onDone }: { status: SetupStatus; onDone: (chosen: string[]) => void }) {
  const [picked, setPicked] = useState<string[]>([])
  const [error, setError] = useState('')
  const toggle = (id: string) => setPicked((p) => p.includes(id) ? p.filter((x) => x !== id) : [...p, id])
  const go = () => call<SetupStatus>('setup.choose',
    { ids: status.choices.map((c) => c.id).filter((id) => picked.includes(id)) })
    .then((s) => onDone(s.chosen)).catch((e: Error) => setError(e.message))
  return (
    <div className="flex h-full flex-col items-center justify-center gap-6 overflow-auto p-8">
      <div className="text-center">
        <h1 className="text-3xl font-bold">Welcome to HPC Hub</h1>
        <p className="mt-2 text-dim">Which clusters do you use? You can change this later in Settings.</p>
      </div>
      <div className="flex w-full max-w-[560px] flex-col gap-3">
        {status.choices.map((c) => {
          const on = picked.includes(c.id)
          return (
            <button key={c.id} onClick={() => toggle(c.id)} aria-pressed={on}
              className={`flex items-center gap-4 rounded-xl bg-card p-4 text-left shadow-[var(--shadow-card)] transition
                ${on ? 'ring-2 ring-accent' : 'hover:bg-hover'}`}>
              <Server size={30} strokeWidth={1.5} className="shrink-0" />
              <div className="min-w-0 flex-1">
                <div className="text-lg font-bold">{c.name}</div>
                <div className="truncate text-[13px] text-dim">{describe(c)}</div>
              </div>
              <span className={`grid size-6 place-items-center rounded-full border-2 ${
                on ? 'border-accent bg-accent text-white' : 'border-line'}`}>{on && <Check size={14} />}</span>
            </button>
          )
        })}
      </div>
      {error && <p className="text-bad">{error}</p>}
      <Button kind="suggested" round disabled={!picked.length} onClick={go}>Continue</Button>
    </div>
  )
}
