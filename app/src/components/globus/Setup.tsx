import { ArrowLeftRight, LogIn, LogOut, RotateCw } from 'lucide-react'
import { useState } from 'react'

import { call } from '../../rpc'
import { shortName } from '../clusters/loginCopy'
import type { GlobusCluster, GlobusStatus } from '../../types/globus'
import { useToast } from '../toast'
import { EDialog, Field as EField, List, MainButton, Row, Section } from '../e/ui'
import { Button, EmptyState } from '../ui'
import { Field } from './Field'
import { HELP } from './format'

function ClientId({ value, onSaved }: { value: string; onSaved: (s: GlobusStatus) => void }) {
  const toast = useToast()
  const [id, setId] = useState(value)
  const save = () => call<GlobusStatus>('globus.set_client', { id }).then(onSaved)
    .catch((e: Error) => toast(`Could not save: ${e.message}`))
  return (
    <div className="flex w-full gap-2">
      <Field className="flex-1 font-mono text-sm" placeholder="Client ID" value={id}
        onChange={(e) => setId(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && id.trim() && save()} />
      <Button kind="suggested" disabled={!id.trim() || id.trim() === value} onClick={save}>Save</Button>
    </div>
  )
}

export function SetUp({ onSaved }: { onSaved: (s: GlobusStatus) => void }) {
  return (
    <EmptyState icon={ArrowLeftRight} title="Set up Globus" text={HELP}
      action={<div className="mt-2 w-full max-w-md"><ClientId value="" onSaved={onSaved} /></div>} />
  )
}

export function SignIn({ onSignIn }: { onSignIn: () => void }) {
  return (
    <EmptyState icon={ArrowLeftRight} title="Sign in to Globus"
      text="Use your university login. Globus then moves files between clusters for you."
      action={<Button kind="primary" onClick={onSignIn}><LogIn size={16} />Sign in</Button>} />
  )
}

/** The gear on Transfers, in style E like the phone's AccountSheet: the account, where each cluster's files are,
 *  Globus Connect, and under Advanced the client ID of your own Globus app. */
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

/** Stop Globus Connect on the cluster and start it again, with every folder you have there now. */
function RestartRow({ cluster: c }: { cluster: GlobusCluster }) {
  const toast = useToast()
  const [busy, setBusy] = useState(false)
  const restart = () => {
    if (busy) return
    setBusy(true)
    toast(`Restarting Globus Connect on ${shortName(c)}…`)
    call('globus.start_personal', { cluster: c.id, restart: true })
      .then(() => toast(`Globus Connect is running on ${shortName(c)}`))
      .catch((e: Error) => toast(`Could not restart it: ${e.message}`))
      .finally(() => setBusy(false))
  }
  return <Row icon={RotateCw} label={busy ? `Restarting on ${shortName(c)}…` : `Restart on ${shortName(c)}`}
    onPress={restart} />
}
