import { ExternalLink } from 'lucide-react'

import type { Cluster } from '../../types/clusters'
import { openSystem } from '../app/openLink'
import { copy, keyHelp } from './loginCopy'

/** "What's an SSH key?": the cluster's own guide in the browser. */
export function KeyHelpLink({ cluster, label }: { cluster: Cluster; label?: string }) {
  return (
    <button type="button" onClick={() => openSystem(keyHelp(cluster))} title={keyHelp(cluster)}
      className="inline-flex items-center gap-1 font-semibold underline-offset-2 hover:underline">
      {label ?? copy.whatsAKey}<ExternalLink size={14} /></button>
  )
}
