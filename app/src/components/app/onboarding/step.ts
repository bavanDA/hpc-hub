import type { Cluster } from '../../../types/clusters'

export type Step = { cluster: Cluster; kind: 'login' | 'node' }
