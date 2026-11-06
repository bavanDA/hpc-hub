import { FolderSearch } from 'lucide-react'
import type { ReactNode } from 'react'

import type { Cluster, Session } from '../../../types/clusters'
import { ClusterPicker } from '../../clusters/ClusterPicker'
import { NotConnected } from '../../clusters/NotConnected'
import { IconButton, Spinner } from '../../ui'
import { MOD } from './mod'
import { Tree } from './Tree'

/** The left side: the cluster, the project switcher and the open folder's tree. */
export function TreePane({ cluster, active, session, root, current, switcher, onGoTo, onOpen, onOther }: {
  cluster: string; active: Cluster | null; session?: Session; root: string; current: string | null
  switcher: ReactNode; onGoTo: () => void; onOpen: (path: string) => void; onOther: (path: string) => void
}) {
  const connected = !!session?.connected
  return (
    <aside aria-label="File tree" className="flex w-[260px] shrink-0 flex-col border-r border-line bg-window">
      <div className="flex h-10 shrink-0 items-center gap-1 border-b border-line px-2">
        <ClusterPicker />
        <span className="flex-1" />
        <IconButton icon={FolderSearch} label={`Go to file (${MOD}P)`} small disabled={!connected || !root}
          onClick={onGoTo} />
      </div>
      {!active ? <div className="grid flex-1 place-items-center"><Spinner size={20} /></div>
        : !connected ? <div className="min-h-0 flex-1 overflow-auto"><NotConnected cluster={active}
            session={session} what="files" /></div>
        : root ? <Tree cluster={cluster} root={root} head={switcher} current={current} onOpen={onOpen}
            onOther={onOther} />
        : <div className="flex h-10 shrink-0 items-center px-2">{switcher}</div>}
    </aside>
  )
}
