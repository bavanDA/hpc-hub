import { FolderOpen, FolderX } from 'lucide-react'

import type { Cluster, Session } from '../../types/clusters'
import type { Entry, Listing, Sort } from '../../types/files'
import { NotConnected } from '../clusters/NotConnected'
import { EmptyState } from '../ui/EmptyState'
import { Spinner } from '../ui/Spinner'
import { FileTable } from './FileTable'

/** The folder's entries, or why there are none to show. */
export function FolderView({ cluster, session, listing, error, entries, sort, onSort, selected, onSelect, onOpen,
  onMenu, onKey }: {
  cluster: Cluster; session?: Session; listing: Listing | null; error: string; entries: Entry[]; sort: Sort
  onSort: (s: Sort) => void; selected: string | null; onSelect: (name: string | null) => void
  onOpen: (e: Entry) => void; onMenu: (e: Entry | null, x: number, y: number) => void
  onKey: (k: string, e: Entry | null) => boolean
}) {
  if (!session?.connected) return <NotConnected cluster={cluster} session={session} what="files" />
  if (!listing) {
    return error ? <EmptyState icon={FolderX} title="Could not open folder" text={error} />
      : <div className="grid h-full place-items-center"><Spinner size={24} /></div>
  }
  if (!entries.length) {
    return <div className="h-full" onContextMenu={(ev) => { ev.preventDefault(); onMenu(null, ev.clientX, ev.clientY) }}>
      <EmptyState icon={FolderOpen} title="Empty folder" /></div>
  }
  return <FileTable entries={entries} sort={sort} onSort={onSort} selected={selected} onSelect={onSelect}
    onOpen={onOpen} onMenu={onMenu} onKey={onKey} />
}
