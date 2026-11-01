// Passcode lock: Claude takes no messages until you start one with the code from your authenticator app.
import { ChevronDown, ChevronRight, ShieldAlert, ShieldCheck } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'

import { call } from '../../rpc'
import type { LockConfig, LockSetup, LockStatus } from '../../types/permissions'
import { Button, Dialog, Row, Spinner } from '../ui'
import { Group, StepperRow, SwitchRow } from './controls'

const ABOUT = 'Claude takes no messages until you start one with the code from your authenticator app, like: ' +
  '123456 fix the tests. Keeps the cluster safe if someone gets into your Claude account.'

export const lockConfig = (s: LockStatus): LockConfig => ({ minutes: s.config.minutes ?? 10,
  tries: s.config.tries ?? 3, logout: s.config.logout ?? true, scancel: s.config.scancel ?? true })

/** The secret stays in the backend until it is on the cluster; this only shows it to scan. */
export function LockSetupDialog({ cluster, name, onClose, onDone }:
  { cluster: string; name: string; onClose: () => void; onDone: (message: string) => void }) {
  const [setup, setSetup] = useState<LockSetup | null>(null)
  const [code, setCode] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const id = useRef('')

  useEffect(() => {
    let live = true
    const drop = (sid: string) => call('permissions.lock_cancel', { id: sid }).catch(() => {})
    call<LockSetup>('permissions.lock_start', { cluster }).then((s) => {
      if (!live) { drop(s.id); return }
      id.current = s.id
      setSetup(s)
    }).catch((e: Error) => setError(e.message))
    return () => {
      live = false
      if (id.current) drop(id.current)  // closed without turning it on: forget the secret
    }
  }, [cluster])

  const turnOn = () => {
    if (!setup || busy || !code.trim()) return
    setBusy(true)
    setError('')
    call('permissions.lock_finish', { id: setup.id, code })
      .then(() => {
        id.current = ''
        onDone(`Passcode lock is on for ${name}. New Claude sessions need a code`)
      })
      .catch((e: Error) => { setError(e.message); setBusy(false) })
  }

  return (
    <Dialog title={`Passcode lock on ${name}`} onClose={onClose} width={420}>
      {!setup ? (
        <div className="grid h-48 place-items-center">{error ? <p className="text-bad">{error}</p> : <Spinner />}</div>
      ) : (
        <div className="flex flex-col items-center gap-4 pb-3 pt-1 text-center">
          <p>Scan this with Google Authenticator (or any authenticator app).</p>
          {setup.qr && <img src={setup.qr} alt="QR code"
            className="size-48 rounded-lg bg-white p-1 [image-rendering:pixelated]" />}
          <div className="text-sm text-dim">
            Or add it by hand, time based:
            <div className="mt-1 select-text font-mono text-md tracking-wide text-text">{setup.key}</div>
          </div>
          <input autoFocus inputMode="numeric" maxLength={7} value={code} placeholder="Code from the app"
            onChange={(e) => setCode(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && turnOn()}
            className="h-12 w-56 rounded-md bg-pill text-center text-xl font-semibold tracking-widest outline-none
              placeholder:text-base placeholder:font-normal placeholder:tracking-normal placeholder:text-dim
              focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-focus" />
          {error && <p className="text-sm text-bad">{error}</p>}
          <Button kind="primary" disabled={busy || !code.trim()} onClick={turnOn}>
            {busy && <Spinner size={14} />}Turn on</Button>
        </div>
      )}
    </Dialog>
  )
}

function Activity({ status }: { status: LockStatus }) {
  const [open, setOpen] = useState(false)
  return (
    <div>
      <Row title="Recent activity" subtitle={`${status.open} session${status.open === 1 ? '' : 's'} open now`}
        onClick={() => setOpen(!open)} suffix={open ? <ChevronDown size={16} className="text-dim" />
          : <ChevronRight size={16} className="text-dim" />} />
      {open && (
        <div className="max-h-56 overflow-auto border-t border-line bg-view/40 px-4 py-2 font-mono text-xs">
          {status.log.length ? status.log.map((l, i) => <div key={i} className="select-text py-0.5">{l}</div>)
            : <p className="py-1 font-sans text-sm text-dim">Nothing yet</p>}
        </div>
      )}
    </div>
  )
}

export function LockGroup({ status, config, onConfig, onSetUp, onUnlock, onOff }: {
  status: LockStatus; config: LockConfig; onConfig: (c: LockConfig) => void; onSetUp: () => void
  onUnlock: () => void; onOff: () => void
}) {
  if (!status.set_up) return (
    <Group title="Passcode lock" description={ABOUT}>
      <Row title={<span className="font-semibold text-accent-text">Set up with Google Authenticator</span>}
        prefix={<ShieldCheck size={20} className="text-accent-text" />} onClick={onSetUp} />
    </Group>
  )
  const set = (part: Partial<LockConfig>) => onConfig({ ...config, ...part })
  return (
    <Group title="Passcode lock" description={ABOUT}>
      {status.locked && (
        <div className="bg-bad-bg">
          <Row title={<span className="font-semibold text-bad">Locked after too many wrong codes</span>}
            subtitle="Someone typed wrong codes. Check Recent activity"
            prefix={<ShieldAlert size={20} className="text-bad" />}
            suffix={<Button onClick={onUnlock}>Unlock</Button>} />
        </div>
      )}
      <StepperRow title="Minutes a code keeps a session open" min={0} max={240} value={config.minutes}
        subtitle="0 asks for a code on every message (safest)"
        onChange={(minutes) => set({ minutes })} />
      <StepperRow title="Wrong codes before Claude is stopped" min={1} max={10} value={config.tries}
        onChange={(tries) => set({ tries })} />
      <SwitchRow title="Then sign Claude out" on={config.logout} onChange={(logout) => set({ logout })} />
      <SwitchRow title="Then cancel Claude's job" on={config.scancel} onChange={(scancel) => set({ scancel })} />
      <Activity status={status} />
      <button onClick={onOff}
        className="flex h-[52px] w-full items-center justify-center font-semibold text-bad hover:bg-hover">
        Turn off passcode lock</button>
    </Group>
  )
}
