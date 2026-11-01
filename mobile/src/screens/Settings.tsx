// More › Settings: light or dark, the clusters you use, staying connected in the background, which notifications to
// get (parts/watchPhone.ts), the monitoring bar, experimental pages, and disconnecting everything at once.
import { Power } from 'lucide-react'
import { useEffect, useState } from 'react'

import { university, type SetupStatus } from '@shared/components/app/Welcome'
import { useClusters } from '@shared/components/clusters/store'
import { setMonitorBar } from '@shared/components/terminals/MonitorBar'
import { call } from '@shared/rpc'
import { setAppearance, type Appearance } from '@shared/theme'
import { Header } from '../parts/Header'
import { askForNotifications, EXPLAIN, KINDS, notificationsAllowed, setPhonePrefs, usePhonePrefs } from '../parts/watchPhone'
import { Card, ConfirmSheet, ListRow, Segments, Switch, useToast } from '../ui'

type Prefs = { monitor_bar: boolean; appearance: Appearance; experimental: boolean }

const THEMES = [['system', 'System'], ['light', 'Light'], ['dark', 'Dark']] as const

function Title({ children }: { children: string }) {
  return <h2 className="mb-2 mt-5 text-sm font-bold text-dim first:mt-0">{children}</h2>
}

export function Settings() {
  const toast = useToast()
  const { sessions } = useClusters()
  const [prefs, setPrefs] = useState<Prefs | null>(null)
  const [setup, setSetup] = useState<SetupStatus | null>(null)
  const phone = usePhonePrefs()
  const [allowed, setAllowed] = useState<boolean | null>(null)
  const [explain, setExplain] = useState(false)
  const [confirm, setConfirm] = useState(false)
  useEffect(() => {
    call<Prefs>('preferences.get').then(setPrefs).catch((e: Error) => toast(e.message))
    call<SetupStatus>('setup.status').then(setSetup).catch(() => {})
    notificationsAllowed().then(setAllowed).catch(() => setAllowed(false))
  }, [toast])

  async function save(change: Partial<Prefs>) {
    try {
      const p = await call<Prefs>('preferences.set', change)
      setPrefs(p)
      setMonitorBar(p.monitor_bar)
    } catch (e) {
      toast((e as Error).message)
    }
  }

  function use(id: string, on: boolean) {
    if (!setup) return
    const ids = setup.choices.map((c) => c.id).filter((x) => (x === id ? on : setup.chosen.includes(x)))
    if (!ids.length) { toast('Keep at least one cluster'); return }
    call<SetupStatus>('setup.choose', { ids })
      .then((s) => { setSetup(s); if ('__TAURI_INTERNALS__' in window) location.reload() })
      .catch((e: Error) => toast(e.message))
  }

  // Android asks once; after a no, only its app settings can change it
  async function allow() {
    const ok = await askForNotifications().catch(() => false)
    setAllowed(ok)
    if (!ok) toast("Android didn't allow notifications. Turn them on in Android's settings for HPC Hub.")
  }

  function notifications(on: boolean) {
    setPhonePrefs({ notify: on })
    if (on && allowed === false) setExplain(true)
  }

  const live = Object.values(sessions).filter((s) => s.state !== 'Disconnected' && s.state !== 'Error')
  function disconnectAll() {
    for (const s of live) call('clusters.disconnect', { cluster: s.id }).catch((e: Error) => toast(e.message))
  }

  return (
    <div className="flex h-full flex-col">
      <Header title="Settings" />
      <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-6">
        <Title>Appearance</Title>
        <Segments value={prefs?.appearance ?? 'system'} options={THEMES}
          onChange={(appearance) => { setAppearance(appearance); save({ appearance }) }} />

        {setup && <>
          <Title>Clusters you use</Title>
          <Card className="py-1">
            {setup.choices.map((c) => (
              <Switch key={c.id} label={c.name.split(' (')[0]} hint={university(c) || undefined} checked={setup.chosen.includes(c.id)}
                onChange={(on) => use(c.id, on)} />
            ))}
          </Card>
          <p className="mt-1 text-sm text-dim">The others are hidden. Their settings are kept.</p>
        </>}

        <Title>On the phone</Title>
        <Card className="py-1">
          <Switch label="Stay connected in the background"
            hint="Your clusters stay connected while you use other apps. Android shows a small notice, and the phone uses a little more battery while a cluster is connected."
            checked={phone.keep} onChange={(keep) => setPhonePrefs({ keep })} />
          <Switch label="Notifications"
            hint={phone.notify && allowed === false ? 'Android has them off for HPC Hub.'
              : 'Not while you are already looking at what they are about.'}
            checked={phone.notify} onChange={notifications} />
          {phone.notify && allowed === false && (
            <ListRow title="Allow notifications" subtitle="Android asks you once" onClick={() => setExplain(true)} />
          )}
        </Card>
        {phone.notify && (
          <Card className="mt-3 py-1">
            {KINDS.map(([kind, label]) => (
              <Switch key={kind} label={label} checked={phone.kinds[kind]}
                onChange={(on) => setPhonePrefs({ kinds: { ...phone.kinds, [kind]: on } })} />
            ))}
          </Card>
        )}

        <Title>Terminals</Title>
        <Card className="py-1">
          <Switch label="Monitoring bar" hint="CPU, memory and network of the host, under each terminal."
            checked={prefs?.monitor_bar ?? true} onChange={(on) => save({ monitor_bar: on })} />
        </Card>

        <Title>Experimental</Title>
        <Card className="py-1">
          <Switch label="Experimental features" hint="Papers, and the Scheduled and Skills tabs of Agents. They may change."
            checked={prefs?.experimental ?? false} onChange={(on) => save({ experimental: on })} />
        </Card>

        {!!live.length && <>
          <Title>Connections</Title>
          <Card className="py-1">
            <ListRow icon={Power} danger title="Disconnect all"
              subtitle={live.length === 1 ? '1 cluster connected' : `${live.length} clusters connected`}
              onClick={() => setConfirm(true)} />
          </Card>
        </>}
      </div>
      {explain && <ConfirmSheet title="Get notifications?" text={EXPLAIN} confirm="Allow" onConfirm={allow}
        onClose={() => setExplain(false)} />}
      {confirm && <ConfirmSheet title="Disconnect all clusters?" danger confirm="Disconnect all"
        text="Your compute nodes started by HPC Hub end. Sessions in tmux keep running on the clusters."
        onConfirm={disconnectAll} onClose={() => setConfirm(false)} />}
    </div>
  )
}
