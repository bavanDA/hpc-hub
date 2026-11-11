// The passcode lock on the Permissions tab: the desktop's rows, its activity window opened by the page so Android's
// Back can close it.
import { ShieldCheck } from 'lucide-react'
import { useEffect, useState } from 'react'

import type { LockConfig, LockStatus } from '@shared/types/permissions'
import { Button, ItemRow, NumberRow, Row, Section, ToggleRow } from '../../ui'

const ABOUT = 'Claude takes no messages until you start one with the code from your authenticator app, like: ' +
  '123456 fix the tests.'

export function LockSection({ status, config, onConfig, onSetUp, onUnlock, onOff, onActivity }: {
  status: LockStatus; config: LockConfig; onConfig: (c: LockConfig) => void; onSetUp: () => void
  onUnlock: () => void; onOff: () => void; onActivity: () => void
}) {
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
          sub="Check Recent activity"><Button small onClick={onUnlock}>Unlock</Button></Row>
      )}
      <ToggleRow label="Ask for the code on every message" checked={every}
        onChange={(v) => { setEvery(v); set({ minutes: v ? 0 : 10 }) }} />
      {!every && <NumberRow label="A code lasts" unit="min" min={1} max={240} value={config.minutes}
        onChange={(minutes) => set({ minutes: minutes > 0 ? minutes : -1 })} />}
      <NumberRow label="Wrong codes allowed" unit={config.tries === 1 ? 'code' : 'codes'} min={1} max={10}
        value={config.tries} onChange={(tries) => set({ tries })} />
      <ToggleRow label="Then sign Claude out" checked={config.logout} onChange={(logout) => set({ logout })} />
      <ToggleRow label="Then cancel Claude's job" checked={config.scancel} onChange={(scancel) => set({ scancel })} />
      <Row label="Recent activity" opens onPress={onActivity}
        sub={`${status.open} session${status.open === 1 ? '' : 's'} open now`} />
      <Row label={<span className="text-bad">Turn off passcode lock</span>} onPress={onOff} />
    </Section>
  )
}
