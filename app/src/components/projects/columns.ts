import type { SortKey } from './format'

export type Column = { key: SortKey | 'group' | 'running' | 'git'; title: string; hide?: string }
// hide: the container width under which the column goes
export const COLUMNS: Column[] = [
  { key: 'name', title: 'Name and folder' },
  { key: 'cluster', title: 'Cluster', hide: '@max-[540px]:hidden' },
  { key: 'group', title: 'Group', hide: '@max-[760px]:hidden' },
  { key: 'opened', title: 'Last opened', hide: '@max-[620px]:hidden' },
  { key: 'running', title: 'Running', hide: '@max-[860px]:hidden' },
  { key: 'git', title: 'Git', hide: '@max-[1000px]:hidden' },
]
