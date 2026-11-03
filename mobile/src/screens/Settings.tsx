// More › Settings: light or dark, the clusters you use, staying connected in the background, which notifications to
// get (parts/watchPhone.ts), the monitoring bar, experimental pages, and disconnecting everything at once.
import { Check, Power } from 'lucide-react'
import { useEffect, useState } from 'react'

import type { SetupStatus } from '@shared/components/app/Welcome'
import { useClusters } from '@shared/components/clusters/store'
import { setMonitorBar } from '@shared/components/terminals/MonitorBar'
import { call } from '@shared/rpc'
import { ThemeSample } from '@shared/components/app/ThemeSample'
import { setAppearance, THEMES, type Appearance } from '@shared/theme'
import { Header } from '../parts/Header'
import { askForNotifications, EXPLAIN, KINDS, notificationsAllowed, setPhonePrefs, usePhonePrefs } from '../parts/watchPhone'
import { ConfirmSheet, Row, Section, ToggleRow, useToast } from '../ui'

type Prefs = { monitor_bar: boolean; appearance: Appearance; experimental: boolean }


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
    if (ok) setPhonePrefs({ notify: true })
    else toast("Android didn't allow it. Turn on notifications for HPC Hub in Android's settings.")
  }

  const live = Object.values(sessions).filter((s) => s.state !== 'Disconnected' && s.state !== 'Error')
  function disconnectAll() {
    for (const s of live) call('clusters.disconnect', { cluster: s.id }).catch((e: Error) => toast(e.message))
  }

  return (
    <div className="flex h-full flex-col">
      <Header title="Settings" />
      <div className="min-h-0 flex-1 overflow-y-auto pb-8">
        <Section title="Appearance">
          {THEMES.map((t) => (
            <Row key={t.id} label={<span className="flex items-center gap-3"><ThemeSample theme={t} />{t.label}</span>}
              onPress={() => { setAppearance(t.id); save({ appearance: t.id }) }}>
              {(prefs?.appearance ?? 'system') === t.id
                ? <Check size={20} aria-label="Chosen" className="shrink-0" /> : <span className="w-5" />}</Row>
          ))}
        </Section>

        {setup && (
          <Section title="Clusters you use" note="Hidden clusters keep their settings.">
            {setup.choices.map((c) => (
              <ToggleRow key={c.id} label={c.name} checked={setup.chosen.includes(c.id)} onChange={(on) => use(c.id, on)} />
            ))}
          </Section>
        )}

        <Section title="Notifications">
          {allowed === false
            ? <Row label="Allow notifications" sub="Duo, your node's time, jobs, copies and agents"
                onPress={() => setExplain(true)} />
            : <ToggleRow label="Notifications" checked={phone.notify} onChange={(notify) => setPhonePrefs({ notify })} />}
          {allowed && phone.notify && KINDS.map(([kind, label]) => (
            <ToggleRow key={kind} label={label} checked={phone.kinds[kind]}
              onChange={(on) => setPhonePrefs({ kinds: { ...phone.kinds, [kind]: on } })} />
          ))}
        </Section>

        <Section title="On the phone">
          <ToggleRow label="Stay connected in the background" sub="Uses a little more battery while a cluster is connected."
            checked={phone.keep} onChange={(keep) => setPhonePrefs({ keep })} />
          <ToggleRow label="Monitoring bar" sub="CPU, memory and network under each terminal."
            checked={prefs?.monitor_bar ?? true} onChange={(on) => save({ monitor_bar: on })} />
          <ToggleRow label="Experimental features" sub="Papers, and the Scheduled and Skills tabs in Agents."
            checked={prefs?.experimental ?? false} onChange={(on) => save({ experimental: on })} />
        </Section>

        {!!live.length && (
          <Section>
            <Row icon={Power} danger label="Disconnect all"
              sub={live.length === 1 ? '1 cluster connected' : `${live.length} clusters connected`}
              onPress={() => setConfirm(true)} />
          </Section>
        )}
      </div>
      {explain && <ConfirmSheet title="Get notifications?" text={EXPLAIN} keep="Not now" confirm="Allow" onConfirm={allow}
        onClose={() => setExplain(false)} />}
      {confirm && <ConfirmSheet title="Disconnect all clusters?" danger keep="Stay connected" confirm="Disconnect all"
        text="Nodes you got in HPC Hub are released. Your terminal sessions keep running."
        onConfirm={disconnectAll} onClose={() => setConfirm(false)} />}
    </div>
  )
}
