// Settings, opened from the bottom of the drawer: the desktop's window, with the appearance, the clusters you use,
// staying connected in the background, which notifications to get (parts/watchPhone.ts), the monitoring bar, the
// experimental switches, About and disconnecting everything at once.
import { Power } from 'lucide-react'
import { useEffect, useState } from 'react'

import type { SetupStatus } from '@shared/components/app/setup'
import { useClusters } from '@shared/components/clusters/store'
import { setMonitorBar } from '@shared/components/terminals/monitorBarSetting'
import { call } from '@shared/rpc'
import { ThemePicker } from '@shared/components/app/ThemePicker'
import { AboutDialog } from '@shared/components/app/About'
import { experimentsOf, type Preferences } from '@shared/components/app/types'
import { openReport } from '@shared/components/report/open'
import { setExperiments } from '../parts/experiments'
import { askBatteryUnrestricted, batteryUnrestricted } from '../parts/native'
import { askForNotifications, EXPLAIN, KINDS, notificationsAllowed, setPhonePrefs, usePhonePrefs } from '../parts/watchPhone'
import { BackLayer, ConfirmSheet, Dialog, Row, Section, ToggleRow, useToast } from '../ui'

export function Settings({ onClose }: { onClose: () => void }) {
  const toast = useToast()
  const { sessions } = useClusters()
  const [prefs, setPrefs] = useState<Preferences | null>(null)
  const [setup, setSetup] = useState<SetupStatus | null>(null)
  const phone = usePhonePrefs()
  const [allowed, setAllowed] = useState<boolean | null>(null)
  const [battery, setBattery] = useState<boolean | null>(null)  // null: not on a phone
  const [explain, setExplain] = useState(false)
  const [confirm, setConfirm] = useState(false)
  const [about, setAbout] = useState(false)
  useEffect(() => {
    call<Preferences>('preferences.get').then(setPrefs).catch((e: Error) => toast(e.message))
    call<SetupStatus>('setup.status').then(setSetup).catch(() => {})
    notificationsAllowed().then(setAllowed).catch(() => setAllowed(false))
  }, [toast])
  useEffect(() => {  // again when you come back from Android's question
    const look = () => { if (document.visibilityState === 'visible') batteryUnrestricted().then(setBattery).catch(() => {}) }
    look()
    document.addEventListener('visibilitychange', look)
    return () => document.removeEventListener('visibilitychange', look)
  }, [])

  async function save(change: Partial<Preferences>) {
    try {
      const p = await call<Preferences>('preferences.set', change)
      setPrefs(p)
      setMonitorBar(p.monitor_bar)
      setExperiments(experimentsOf(p))
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
    <>
      <Dialog title="Settings" onClose={onClose}>
        <section className="pb-1">
          <h3 className="px-5 pb-1.5 text-xs font-semibold tracking-wide text-dim uppercase">Appearance</h3>
          <div className="px-5">
            <ThemePicker value={prefs?.appearance ?? 'system'} onChange={(appearance) => save({ appearance })} />
          </div>
        </section>

        {setup && (
          <Section title="Clusters" note="The ones you use. The others are hidden, their settings kept.">
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
          {battery !== null && <Row label="Run without battery limits" value={battery ? 'On' : 'Turn on'}
            sub="So Android doesn't close your connections to save battery."
            onPress={battery ? undefined : () => askBatteryUnrestricted().catch((e: Error) => toast(e.message))} />}
          <ToggleRow label="Monitoring bar" sub="CPU, memory and network of the host, under each terminal."
            checked={prefs?.monitor_bar ?? true} onChange={(on) => save({ monitor_bar: on })} />
        </Section>

        <Section title="Experimental" note="They may change or break.">
          <ToggleRow label="Papers" sub="Write LaTeX papers with their history, notes and the agent's help."
            checked={prefs?.experimental_papers ?? false} onChange={(on) => save({ experimental_papers: on })} />
          <ToggleRow label="Skills" sub="The Skills tab of Agents: what each agent knows on a cluster."
            checked={prefs?.experimental_skills ?? false} onChange={(on) => save({ experimental_skills: on })} />
          <ToggleRow label="Scheduled agents" sub="The Scheduled tab of Agents: an agent runs a task on its own at set times."
            checked={prefs?.experimental_schedules ?? false} onChange={(on) => save({ experimental_schedules: on })} />
        </Section>

        <Section title="HPC Hub">
          <Row label="About HPC Hub" opens onPress={() => setAbout(true)} />
          <Row label="Report a problem" opens onPress={() => { onClose(); openReport({ kind: 'user' }) }} />
          {!!live.length && <Row icon={Power} danger label="Disconnect all"
            sub={live.length === 1 ? '1 cluster connected' : `${live.length} clusters connected`}
            onPress={() => setConfirm(true)} />}
        </Section>
        <div className="h-3" />
      </Dialog>
      {about && <BackLayer onBack={() => setAbout(false)}><AboutDialog onClose={() => setAbout(false)} /></BackLayer>}
      {explain && <ConfirmSheet title="Get notifications?" text={EXPLAIN} keep="Not now" confirm="Allow" onConfirm={allow}
        onClose={() => setExplain(false)} />}
      {confirm && <ConfirmSheet title="Disconnect all clusters?" danger keep="Stay connected" confirm="Disconnect all"
        text="Nodes you got in HPC Hub are released. Your terminal sessions keep running."
        onConfirm={disconnectAll} onClose={() => setConfirm(false)} />}
    </>
  )
}
