// Before Globus works: your Globus app's client id, then a sign-in. Plus the account sheet behind the gear:
// client id, sign out, and the collection that holds each cluster's files.
import { ArrowLeftRight, LogIn, LogOut } from 'lucide-react'
import { useState } from 'react'

import { HELP } from '@shared/components/globus/parts'
import { call } from '@shared/rpc'
import type { GlobusCluster, GlobusStatus } from '@shared/types/globus'
import { EmptyState, Field, MainButton, Row, Section, Sheet, useToast } from '../../ui'
import { shortCluster } from '../code/util'

function ClientId({ value, onSaved }: { value: string; onSaved: (s: GlobusStatus) => void }) {
  const toast = useToast()
  const [id, setId] = useState(value)
  const save = () => call<GlobusStatus>('globus.set_client', { id }).then((s) => { toast('Saved'); onSaved(s) })
    .catch((e: Error) => toast(`Could not save: ${e.message}`))
  return (
    <form className="w-full" onSubmit={(e) => { e.preventDefault(); if (id.trim()) save() }}>
      <Field label="Client ID" value={id} placeholder="Paste it here" autoCapitalize="none" autoCorrect="off"
        spellCheck={false} onChange={(e) => setId(e.target.value)} />
      <MainButton className="mt-1" disabled={!id.trim() || id.trim() === value}>Save</MainButton>
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
      action={<MainButton icon={LogIn} onClick={onSignIn}>Sign in</MainButton>} />
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
    <Sheet flush title="Globus account" onClose={onClose}>
      <div className="border-t border-line">
        {status.signed_in
          ? <Row icon={LogOut} label="Sign out of Globus" onPress={signOut} />
          : <Row icon={LogIn} label="Sign in to Globus" opens onPress={onSignIn} />}
      </div>
      {status.signed_in && (
        <Section title="Collections" note="Where Globus finds each cluster's files.">
          {status.clusters.map((c) => (
            <Row key={c.id} label={shortCluster(c.name)} value={c.collection_id ? c.collection_name : 'Not set'} opens
              onPress={() => onChoose(c)} />
          ))}
        </Section>
      )}
      <section className="px-4 pt-6">
        <h3 className="pb-1.5 text-xs font-semibold tracking-wide text-dim uppercase">Client ID</h3>
        <p className="text-sm text-dim">{HELP}</p>
        <ClientId value={status.client_id} onSaved={onChange} />
      </section>
    </Sheet>
  )
}
