// Before Globus works: your app's client id, then a sign-in. Plus the settings dialog behind the gear.
import { ArrowLeftRight, LogIn } from 'lucide-react'
import { useState } from 'react'

import { call } from '../../rpc'
import type { GlobusCluster, GlobusStatus } from '../../types/globus'
import { useToast } from '../toast'
import { Button, Dialog, EmptyState, List, Row } from '../ui'
import { Field, HELP } from './parts'

function ClientId({ value, onSaved }: { value: string; onSaved: (s: GlobusStatus) => void }) {
  const toast = useToast()
  const [id, setId] = useState(value)
  const save = () => call<GlobusStatus>('globus.set_client', { id }).then(onSaved)
    .catch((e: Error) => toast(`Could not save: ${e.message}`))
  return (
    <div className="flex w-full gap-2">
      <Field className="flex-1 font-mono text-[13px]" placeholder="Client ID" value={id}
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
      action={<Button kind="suggested" round className="mt-2" onClick={onSignIn}><LogIn size={16} />Sign in</Button>} />
  )
}

export function SettingsDialog({ status, onClose, onChange, onSignIn, onChoose }: {
  status: GlobusStatus; onClose: () => void; onChange: (s: GlobusStatus) => void; onSignIn: () => void
  onChoose: (c: GlobusCluster) => void
}) {
  const toast = useToast()
  const signOut = () => call<GlobusStatus>('globus.logout').then((s) => { toast('Signed out of Globus'); onChange(s) })
    .catch((e: Error) => toast(`Could not sign out: ${e.message}`))
  return (
    <Dialog title="Globus" onClose={onClose} width={560}>
      <div className="flex flex-col gap-5 pt-1">
        <section className="flex flex-col gap-2">
          <h3 className="font-bold">Account</h3>
          <p className="text-[13px] text-dim">{HELP}</p>
          <ClientId value={status.client_id} onSaved={onChange} />
          <List>
            <Row title="Status" subtitle={status.signed_in ? 'Signed in' : 'Not signed in'}
              suffix={status.signed_in ? <Button kind="destructive" onClick={signOut}>Sign out</Button>
                : <Button kind="suggested" disabled={!status.client_id} onClick={onSignIn}>
                  Sign in to Globus</Button>} />
          </List>
        </section>
        <section className={`flex flex-col gap-2 ${status.signed_in ? '' : 'pointer-events-none opacity-50'}`}>
          <h3 className="font-bold">Collections</h3>
          <p className="text-[13px] text-dim">Pick the Globus collection that holds each cluster's files.</p>
          <List>
            {status.clusters.map((c) => (
              <Row key={c.id} title={c.name}
                subtitle={c.collection_id ? `${c.collection_name} · ${c.collection_id}` : 'Not set'}
                suffix={<Button onClick={() => onChoose(c)}>Choose…</Button>} />
            ))}
          </List>
        </section>
      </div>
    </Dialog>
  )
}
