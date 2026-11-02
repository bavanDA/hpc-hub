// Passcode lock: Claude takes no messages until you start one with the code from your authenticator app. Style E,
// like the phone's LockSection: switches, numbers typed in place, Recent activity and setup in windows of their own.
import { ShieldCheck } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'

import { call } from '../../rpc'
import type { LockConfig, LockSetup, LockStatus } from '../../types/permissions'
import { EButton, ItemRow } from '../e/extra'
import { EDialog, Field, inRange, List, MainButton, NumberRow, Row, Section, ToggleRow } from '../e/ui'
import { Spinner } from '../ui'

const ABOUT = 'Claude takes no messages until you start one with the code from your authenticator app, like: ' +
  '123456 fix the tests.'

export const lockConfig = (s: LockStatus): LockConfig => ({ minutes: s.config.minutes ?? 10,
  tries: s.config.tries ?? 3, logout: s.config.logout ?? true, scancel: s.config.scancel ?? true })

/** Whether the typed numbers are allowed, so the page can hold Save. */
export const lockOk = (c: LockConfig) => inRange(c.minutes, 0, 240) && inRange(c.tries, 1, 10)

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
    <EDialog title={`Passcode lock on ${name}`} width={420} onClose={onClose}
      actions={setup && <MainButton disabled={busy || !code.trim()} onClick={turnOn}>
        {busy && <Spinner size={16} />}Turn on</MainButton>}>
      {!setup ? (
        <div className="grid h-48 place-items-center">{error ? <p className="text-bad">{error}</p> : <Spinner />}</div>
      ) : (
        <div className="flex flex-col items-center gap-4 px-5 text-center">
          <p>Scan this with Google Authenticator or another authenticator app.</p>
          {setup.qr && <img src={setup.qr} alt="QR code"
            className="size-48 rounded-lg border border-line bg-white p-1 [image-rendering:pixelated]" />}
          <div className="text-sm text-dim">Or type this key in the app:
            <div className="mt-1 font-mono text-md tracking-wide text-text select-text">{setup.key}</div></div>
          <form className="w-full text-left" onSubmit={(e) => { e.preventDefault(); turnOn() }}>
            <Field label="Code from the app" inputMode="numeric" maxLength={7} value={code} autoFocus
              onChange={(e) => setCode(e.target.value)} />
          </form>
          {error && <p className="text-sm text-bad">{error}</p>}
        </div>
      )}
    </EDialog>
  )
}

function ActivityDialog({ status, onClose }: { status: LockStatus; onClose: () => void }) {
  return (
    <EDialog title="Recent activity" width={640} onClose={onClose}>
      {status.log.length
        ? <List>{status.log.map((l, i) => <Row key={i} label={<span className="font-mono text-sm select-text">{l}</span>} />)}
          </List>
        : <p className="px-5 pb-3 text-dim">Nothing yet.</p>}
    </EDialog>
  )
}

export function LockSection({ status, config, onConfig, onSetUp, onUnlock, onOff }: {
  status: LockStatus; config: LockConfig; onConfig: (c: LockConfig) => void; onSetUp: () => void
  onUnlock: () => void; onOff: () => void
}) {
  const [activity, setActivity] = useState(false)
  // "Every message" is its own choice: clearing the minutes while typing (-1) must not turn it on
  const [every, setEvery] = useState(config.minutes === 0)
  useEffect(() => { if (config.minutes >= 0) setEvery(config.minutes === 0) }, [config.minutes])
  if (!status.set_up) return (
    <Section title="Passcode lock" note={ABOUT}>
      <ItemRow icon={ShieldCheck} label="Set up with Google Authenticator" onPress={onSetUp} />
    </Section>
  )
  const set = (part: Partial<LockConfig>) => onConfig({ ...config, ...part })
  return (
    <Section title="Passcode lock" note={ABOUT}>
      {status.locked && (
        <Row label={<span className="font-semibold text-bad">Locked after wrong codes</span>}
          sub="Check Recent activity"><EButton small onClick={onUnlock}>Unlock</EButton></Row>
      )}
      <ToggleRow label="Ask for the code on every message" checked={every}
        onChange={(v) => { setEvery(v); set({ minutes: v ? 0 : 10 }) }} />
      {!every && <NumberRow label="A code lasts" unit="min" min={1} max={240} value={config.minutes}
        onChange={(minutes) => set({ minutes: minutes > 0 ? minutes : -1 })} />}
      <NumberRow label="Wrong codes allowed" unit={config.tries === 1 ? 'code' : 'codes'} min={1} max={10}
        value={config.tries} onChange={(tries) => set({ tries })} />
      <ToggleRow label="Then sign Claude out" checked={config.logout} onChange={(logout) => set({ logout })} />
      <ToggleRow label="Then cancel Claude's job" checked={config.scancel} onChange={(scancel) => set({ scancel })} />
      <Row label="Recent activity" opens onPress={() => setActivity(true)}
        sub={`${status.open} session${status.open === 1 ? '' : 's'} open now`} />
      <Row label={<span className="text-bad">Turn off passcode lock</span>} onPress={onOff} />
      {activity && <ActivityDialog status={status} onClose={() => setActivity(false)} />}
    </Section>
  )
}
