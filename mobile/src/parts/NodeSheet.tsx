// A cluster's compute node on the phone: the desktop's size rows (NodeFields) and its Get a node window, with the
// phone's Queue and priority window, which answers Android's Back.
import type { ComponentProps } from 'react'

import { ComputeDialog } from '@shared/components/clusters/ComputeDialog'
import { NodeFields as DesktopNodeFields } from '@shared/components/clusters/node/NodeFields'
import { QueueWindow } from '@shared/components/clusters/node/QueueDialog'
import type { Cluster } from '@shared/types/clusters'
import { BackLayer } from '../ui'
import { QueueDialog } from './clusters/QueueDialog'

/** The size rows: quick sizes, then cores, memory, time, the queue, and the cost. A wrapper so pages keep passing
 *  the cluster itself. */
export function NodeFields({ cluster, ...props }:
  { cluster: Cluster } & Omit<ComponentProps<typeof DesktopNodeFields>, 'cluster'>) {
  return <QueueWindow.Provider value={QueueDialog}>
    <DesktopNodeFields cluster={cluster.id} {...props} /></QueueWindow.Provider>
}

/** Get a node now: the desktop's window, the saved size filled in; asks about maintenance first. */
export function NodeSheet({ cluster, onClose }: { cluster: Cluster; onClose: () => void }) {
  return (
    <BackLayer onBack={onClose}><QueueWindow.Provider value={QueueDialog}>
      <ComputeDialog cluster={cluster} onClose={onClose} /></QueueWindow.Provider></BackLayer>
  )
}
