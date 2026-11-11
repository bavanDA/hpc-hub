import { CircleAlert } from 'lucide-react'

import { BackupFlow } from '../components/backup/BackupFlow'
import { shortName } from '../components/backup/format'
import { useActiveCluster } from '../components/clusters/active'
import { NotConnected } from '../components/clusters/NotConnected'
import { EmptyState } from '../components/e/EmptyState'
import { Spinner } from '../components/ui/Spinner'

export function Backup() {
  const { clusters, cluster, session, connected, error } = useActiveCluster()
  if (error) return <EmptyState icon={CircleAlert} title="Could not load clusters" text={error} report />
  if (!clusters || !cluster) return <div className="grid h-full place-items-center"><Spinner size={24} /></div>
  if (!connected) return <NotConnected cluster={cluster} session={session} what="scratch" />
  return <BackupFlow key={cluster.id} id={cluster.id} name={shortName(cluster.name)} />
}
