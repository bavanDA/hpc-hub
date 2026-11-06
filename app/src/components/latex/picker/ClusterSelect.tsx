import type { LatexCluster } from '../../../types/latex'
import { Select } from '../../jobs/Select'

export function ClusterSelect({ clusters, value, onChange }:
  { clusters: LatexCluster[]; value: string; onChange: (id: string) => void }) {
  return (
    <Select label="Cluster" value={value} onChange={onChange}
      options={clusters.map((c) => [c.id, `${c.name}${c.connected ? '' : ' (not connected)'}`] as const)} />
  )
}
