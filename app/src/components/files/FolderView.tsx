import { FolderOpen, FolderX } from 'lucide-react'
import type { ComponentProps } from 'react'

import type { Cluster, Session } from '../../types/clusters'
import type { Listing } from '../../types/files'
import { NotConnected } from '../clusters/NotConnected'
import { EmptyState } from '../ui/EmptyState'
import { Spinner } from '../ui/Spinner'
import { FileTable } from './FileTable'

/** The folder's entries, or why there are none to show. */
export function FolderView({ cluster, session, listing, error, ...table }: {
  cluster: Cluster; session?: Session; listing: Listing | null; error: string
} & ComponentProps<typeof FileTable>) {
  if (!session?.connected) return <NotConnected cluster={cluster} session={session} what="files" />
  if (!listing) {
    return error ? <EmptyState icon={FolderX} title="Could not open folder" text={error} report />
      : <div className="grid h-full place-items-center"><Spinner size={24} /></div>
  }
  if (!table.entries.length) {
    return <div className="h-full"
      onContextMenu={(ev) => { ev.preventDefault(); table.onMenu(null, ev.clientX, ev.clientY) }}>
      <EmptyState icon={FolderOpen} title="Empty folder" /></div>
  }
  return <FileTable {...table} />
}
