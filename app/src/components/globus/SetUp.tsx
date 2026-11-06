import { ArrowLeftRight } from 'lucide-react'

import type { GlobusStatus } from '../../types/globus'
import { EmptyState } from '../ui/EmptyState'
import { ClientId } from './ClientId'
import { HELP } from './format'

export function SetUp({ onSaved }: { onSaved: (s: GlobusStatus) => void }) {
  return (
    <EmptyState icon={ArrowLeftRight} title="Set up Globus" text={HELP}
      action={<div className="mt-2 w-full max-w-md"><ClientId value="" onSaved={onSaved} /></div>} />
  )
}
