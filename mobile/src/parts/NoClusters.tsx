// A page that shows a cluster's data, before any cluster is set up.
import { Server } from 'lucide-react'

import { usePhoneNav } from '../nav'
import { Button, EmptyState } from '../ui'

export function NoClusters() {
  const { open } = usePhoneNav()
  return <EmptyState icon={Server} title="No clusters set up" text="Add a cluster to see it here."
    action={<Button kind="primary" onClick={() => open('clusters')}>Go to Clusters</Button>} />
}
