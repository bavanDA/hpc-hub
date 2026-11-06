import { ArrowLeftRight } from 'lucide-react'
import { useState } from 'react'

import { call } from '../../rpc'
import type { GlobusStatus } from '../../types/globus'
import { useToast } from '../useToast'
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
