// Which connected cluster a one-cluster tab (Scheduled, Skills) shows, as segments when there are several.
// The pick is the app-wide one (clusters/active.ts), so Jobs and Files follow it too.
import { WifiOff } from 'lucide-react'

import { EmptyState, Segments } from '../../ui'
import { useConnected } from '../useConnected'

export function useClusterTab() {
  const { live, current, pick } = useConnected()
  const picker = live.length > 1 && current
    ? <div className="px-4 pb-1"><Segments label="Cluster" value={current.id} onChange={pick}
        options={live.map((c) => [c.id, c.name.split(' (')[0]] as const)} /></div>
    : null
  return { live, current, picker }
}

export function NotConnectedHere({ what }: { what: string }) {
  return <div className="h-[50vh]"><EmptyState icon={WifiOff} title="Not connected"
    text={`Connect a cluster on the Clusters tab to see its ${what}.`} /></div>
}
