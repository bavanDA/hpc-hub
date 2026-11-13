import { useEffect, useState } from 'react'

import { call } from '../../rpc'
import { EDialog } from '../e/EDialog'
import { Row } from '../e/Row'
import { Section } from '../e/Section'
import { ToggleRow } from '../e/ToggleRow'
import { Select } from '../jobs/Select'
import { setMonitorBar } from '../terminals/monitorBarSetting'
import { setSelectToCopy } from '../terminals/xterm'
import { openReport } from '../report/open'
import { Spinner } from '../ui/Spinner'
import { useToast } from '../useToast'
import { AboutDialog } from './About'
import { UpdateRow } from './UpdateRow'
import { AppearanceGroup } from './Appearance'
import { forgetProfiles, getProfiles } from './openLink'
import { PairPhoneDialog } from './PairPhoneDialog'
import { PaperAgent } from './PaperAgent'
import { university, type SetupStatus } from './setup'
import { experimentsOf, type Experiments, type Preferences, type Profiles } from './types'

export function PreferencesDialog({ onClose, onExperimental, onDisconnectAndQuit }:
  { onClose: () => void; onExperimental: (e: Experiments) => void; onDisconnectAndQuit: () => void }) {
  const [inner, setInner] = useState<'' | 'phone' | 'about'>('')
  const toast = useToast()
  const [prefs, setPrefs] = useState<Preferences | null>(null)
  const [found, setFound] = useState<Profiles | null>(null)
  const [setup, setSetup] = useState<SetupStatus | null>(null)
  useEffect(() => {
    call<SetupStatus>('setup.status').then(setSetup).catch(() => {})
    call<Preferences>('preferences.get').then(setPrefs).catch((e: Error) => toast(`Could not load: ${e.message}`))
    getProfiles().then(setFound)
  }, [toast])

  const save = (changes: Partial<Preferences>) => {
    if (prefs) setPrefs({ ...prefs, ...changes })
    call<Preferences>('preferences.set', changes).then((p) => {
      setPrefs(p)
      forgetProfiles()
      if (Object.keys(changes).some((k) => k.startsWith('experimental_'))) onExperimental(experimentsOf(p))
      setSelectToCopy(p.select_to_copy)
      setMonitorBar(p.monitor_bar)
    }).catch((e: Error) => toast(`Could not save: ${e.message}`))
  }

  const profiles = found?.profiles ?? []
  const current = profiles.find((p) => p.name.toLowerCase() === prefs?.browser_profile.toLowerCase())?.name ?? ''
  const options: [string, string][] = [['', 'System browser'],
    ...profiles.map((p): [string, string] => [p.name, `Chrome: ${p.name}${p.email ? ` (${p.email})` : ''}`])]
  return (
    <EDialog title="Settings" onClose={onClose} width={560}>
      {!prefs || !found ? <div className="grid h-40 place-items-center"><Spinner size={24} /></div> : <>
        <AppearanceGroup value={prefs.appearance} onChange={(appearance) => save({ appearance })} />
        <Section title="Links" note="Links open in this browser. You can pick another each time.">
          <Row label={<span className="whitespace-nowrap">Default for links</span>}>
            <Select label="Default for links" value={current} options={options}
              onChange={(v) => save({ browser_profile: v })} disabled={!profiles.length} />
          </Row>
          {!profiles.length && <Row label="No Chrome profiles found" sub="Install Google Chrome to pick a profile." />}
        </Section>
        {setup && <Section title="Clusters" note="The ones you use. The others are hidden, their settings kept.">
          {setup.choices.map((c) => (
            <ToggleRow key={c.id} label={c.name} sub={university(c) && !c.name.includes(university(c)) ? university(c) : undefined} checked={setup.chosen.includes(c.id)}
              onChange={(on) => {
                const ids = setup.choices.map((x) => x.id)
                  .filter((id) => id === c.id ? on : setup.chosen.includes(id))
                call<SetupStatus>('setup.choose', { ids }).then((s) => { setSetup(s); location.reload() })
                  .catch((e: Error) => toast(e.message))
              }} />
          ))}
        </Section>}
        <Section title="Terminals">
          <ToggleRow label="Select to copy"
            sub="Highlight text with the mouse to copy it."
            checked={prefs.select_to_copy} onChange={(on) => save({ select_to_copy: on })} />
          <ToggleRow label="Monitoring bar"
            sub="CPU, memory and network of the host, under each terminal."
            checked={prefs.monitor_bar} onChange={(on) => save({ monitor_bar: on })} />
        </Section>
        <Section title="Experimental" note="They may change or break.">
          <ToggleRow label="Papers" sub="Write LaTeX papers with their history, notes and the agent's help."
            checked={prefs.experimental_papers} onChange={(on) => save({ experimental_papers: on })} />
          <ToggleRow label="Skills" sub="The Skills tab of Agents: what each agent knows on a cluster."
            checked={prefs.experimental_skills} onChange={(on) => save({ experimental_skills: on })} />
          <ToggleRow label="Scheduled agents" sub="The Scheduled tab of Agents: an agent runs a task on its own at set times."
            checked={prefs.experimental_schedules} onChange={(on) => save({ experimental_schedules: on })} />
        </Section>
        {prefs.experimental_papers && <PaperAgent />}
        <Section title="HPC Hub">
          <Row label="Set up the phone app" opens onPress={() => setInner('phone')} />
          <UpdateRow onOpen={onClose} />
          <Row label="About HPC Hub" opens onPress={() => setInner('about')} />
          <Row label="Report a problem" opens onPress={() => { onClose(); openReport({ kind: 'user' }) }} />
          <Row label="Disconnect all and quit" danger onPress={onDisconnectAndQuit} />
        </Section>
        <div className="h-3" />
      </>}
      {inner === 'phone' && <PairPhoneDialog onClose={() => setInner('')} />}
      {inner === 'about' && <AboutDialog onClose={() => setInner('')} />}
    </EDialog>
  )
}
