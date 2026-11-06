import { LogIn, LogOut } from 'lucide-react'
import { useState } from 'react'

import { call } from '../../rpc'
import type { GlobusCluster, GlobusStatus } from '../../types/globus'
import { shortName } from '../clusters/loginCopy'
import { EDialog } from '../e/EDialog'
import { Field as EField } from '../e/Field'
import { List } from '../e/List'
import { MainButton } from '../e/MainButton'
import { Row } from '../e/Row'
import { Section } from '../e/Section'
import { useToast } from '../useToast'
import { HELP } from './format'
import { RestartRow } from './RestartRow'

export function SettingsDialog({ status, onClose, onChange, onSignIn, onChoose }: {
  status: GlobusStatus; onClose: () => void; onChange: (s: GlobusStatus) => void; onSignIn: () => void
  onChoose: (c: GlobusCluster) => void
}) {
  const toast = useToast()
  const [advanced, setAdvanced] = useState(false)
  const [id, setId] = useState(status.client_id)
  const signOut = () => call<GlobusStatus>('globus.logout').then((s) => { toast('Signed out of Globus'); onChange(s) })
    .catch((e: Error) => toast(`Could not sign out: ${e.message}`))
  const saveId = () => call<GlobusStatus>('globus.set_client', { id: id.trim() })
    .then((s) => { toast('Client ID saved'); onChange(s); setAdvanced(false) })
    .catch((e: Error) => toast(`Could not save: ${e.message}`))
  const own = status.clusters.filter((c) => c.personal)

  if (advanced) {
    return (
      <EDialog title="Advanced" width={520} onClose={onClose} onBack={() => setAdvanced(false)}
        actions={<MainButton disabled={!id.trim() || id.trim() === status.client_id} onClick={saveId}>
          Save client ID</MainButton>}>
        <div className="px-5">
          <EField label="Client ID of your Globus app" value={id}
            onChange={(e) => setId(e.target.value)} />
          <p className="pt-2 text-sm text-dim">{HELP}</p>
        </div>
      </EDialog>
    )
  }
  return (
    <EDialog title="Globus" width={520} onClose={onClose} actions={<MainButton onClick={onClose}>Done</MainButton>}>
      <List>
        {status.signed_in
          ? <Row icon={LogOut} label="Sign out of Globus" onPress={signOut} />
          : <Row icon={LogIn} label="Sign in to Globus" opens onPress={onSignIn} />}
      </List>
      {status.signed_in && <Section title="Collections" note="Where Globus finds each cluster's files.">
        {status.clusters.map((c) => (
          <Row key={c.id} label={shortName(c)} value={c.collection_id ? c.collection_name : 'Not set'} opens
            onPress={() => onChoose(c)} />
        ))}
      </Section>}
      {status.signed_in && own.length > 0 && <Section title="Globus Connect"
        note="Shares your home, project and scratch folders with your own Globus account.">
        {own.map((c) => <RestartRow key={c.id} cluster={c} />)}
      </Section>}
      <Section><Row label="Advanced" sub="Your own Globus app" opens onPress={() => setAdvanced(true)} /></Section>
    </EDialog>
  )
}
