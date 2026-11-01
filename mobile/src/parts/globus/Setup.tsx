// Before Globus works: your Globus app's client id, then a sign-in. Plus the account sheet behind the gear:
// client id, sign out, and the collection that holds each cluster's files.
import { ArrowLeftRight, LogIn, LogOut } from 'lucide-react'
import { useState } from 'react'

import { HELP } from '@shared/components/globus/parts'
import { EmptyState } from '@shared/components/ui'
import { call } from '@shared/rpc'
import type { GlobusCluster, GlobusStatus } from '@shared/types/globus'
import { Button, Card, Field, ListRow, Sheet, useToast } from '../../ui'

function ClientId({ value, onSaved }: { value: string; onSaved: (s: GlobusStatus) => void }) {
  const toast = useToast()
  const [id, setId] = useState(value)
  const save = () => call<GlobusStatus>('globus.set_client', { id }).then((s) => { toast('Saved'); onSaved(s) })
    .catch((e: Error) => toast(`Could not save: ${e.message}`))
  return (
    <form className="w-full" onSubmit={(e) => { e.preventDefault(); if (id.trim()) save() }}>
      <Field label="Client ID" value={id} placeholder="Paste it here" autoCapitalize="none" autoCorrect="off"
        spellCheck={false} onChange={(e) => setId(e.target.value)} />
      <Button kind="primary" className="mt-1 w-full" disabled={!id.trim() || id.trim() === value}>Save</Button>
    </form>
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
      text="Use your university login. Globus then moves files between clusters, even with this app closed."
      action={<Button kind="primary" icon={LogIn} onClick={onSignIn}>Sign in</Button>} />
  )
}

export function AccountSheet({ status, onClose, onChange, onSignIn, onChoose }: {
  status: GlobusStatus; onClose: () => void; onChange: (s: GlobusStatus) => void; onSignIn: () => void
  onChoose: (c: GlobusCluster) => void
}) {
  const toast = useToast()
  const signOut = () => call<GlobusStatus>('globus.logout')
    .then((s) => { toast('Signed out of Globus'); onChange(s) })
    .catch((e: Error) => toast(`Could not sign out: ${e.message}`))
  return (
    <Sheet title="Globus" onClose={onClose}>
      <h2 className="mb-1 font-bold">Account</h2>
      <p className="mb-2 text-sm text-dim">{HELP}</p>
      <ClientId value={status.client_id} onSaved={onChange} />
      <Card className="mt-3 py-1">
        <ListRow icon={status.signed_in ? LogOut : LogIn} title={status.signed_in ? 'Signed in' : 'Not signed in'}
          trailing={status.signed_in
            ? <Button kind="danger" onClick={signOut}>Sign out</Button>
            : <Button kind="primary" disabled={!status.client_id} onClick={onSignIn}>Sign in</Button>} />
      </Card>
      <h2 className="mt-6 mb-1 font-bold">Collections</h2>
      <p className="mb-2 text-sm text-dim">The Globus collection that holds each cluster's files.</p>
      <Card className={`py-1 ${status.signed_in ? '' : 'pointer-events-none opacity-50'}`}>
        {status.clusters.map((c) => (
          <ListRow key={c.id} title={c.name} subtitle={c.collection_id ? c.collection_name : 'Not set'}
            onClick={() => onChoose(c)} />
        ))}
      </Card>
    </Sheet>
  )
}
