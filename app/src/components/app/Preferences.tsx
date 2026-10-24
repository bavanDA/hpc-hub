// Preferences (hpc_hub/ui/preferences.py): which browser opens links, and the experimental pages.
import { useEffect, useState } from 'react'

import { call } from '../../rpc'
import { ActionRow, Group, SwitchRow } from '../clusters/fields'
import { Select } from '../jobs/Select'
import { useToast } from '../toast'
import { Dialog, Row, Spinner } from '../ui'
import { forgetProfiles, getProfiles } from './openLink'
import type { Preferences, Profiles } from './types'
import { describe, type SetupStatus } from './Welcome'

export function PreferencesDialog({ onClose, onExperimental }:
  { onClose: () => void; onExperimental: (on: boolean) => void }) {
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
      if (changes.experimental !== undefined) onExperimental(p.experimental)
    }).catch((e: Error) => toast(`Could not save: ${e.message}`))
  }

  const profiles = found?.profiles ?? []
  const current = profiles.find((p) => p.name.toLowerCase() === prefs?.browser_profile.toLowerCase())?.name ?? ''
  const options: [string, string][] = [['', 'System browser'],
    ...profiles.map((p): [string, string] => [p.name, `Chrome: ${p.name}${p.email ? ` (${p.email})` : ''}`])]
  return (
    <Dialog title="Preferences" onClose={onClose} width={560}>
      {!prefs || !found ? <div className="grid h-40 place-items-center"><Spinner size={24} /></div> : <>
        <Group title="Links" description="Every link asks which browser opens it. This one is picked for you.">
          <ActionRow label={<span className="whitespace-nowrap">Default for links</span>}>
            <Select label="Default for links" value={current} options={options}
              onChange={(v) => save({ browser_profile: v })} disabled={!profiles.length} />
          </ActionRow>
          {!profiles.length && <Row title="No Chrome profiles found" subtitle="Install Google Chrome to pick a profile." />}
        </Group>
        {setup && <Group title="Clusters" description="The ones you use. The others are hidden, their settings kept.">
          {setup.choices.map((c) => (
            <SwitchRow key={c.id} label={c.name} sub={describe(c)} checked={setup.chosen.includes(c.id)}
              onChange={(on) => {
                const ids = setup.choices.map((x) => x.id)
                  .filter((id) => id === c.id ? on : setup.chosen.includes(id))
                call<SetupStatus>('setup.choose', { ids }).then((s) => { setSetup(s); location.reload() })
                  .catch((e: Error) => toast(e.message))
              }} />
          ))}
        </Group>}
        <Group title="Experimental">
          <SwitchRow label="Experimental features" sub="LaTeX, Skills and Scheduled agents. They may change or break."
            checked={prefs.experimental} onChange={(on) => save({ experimental: on })} />
        </Group>
      </>}
    </Dialog>
  )
}
