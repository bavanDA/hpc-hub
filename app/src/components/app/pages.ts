import {
  Bot, FileCode2, FileText, FolderOpen, Gauge, LayoutGrid, ListChecks, Server, SquareTerminal, type LucideIcon,
} from 'lucide-react'

import type { Experiments } from './types'

/** The pages in the sidebar. The rest are older names that now open a tab of one of them (App.tsx MOVED). */
export type Page = 'clusters' | 'projects' | 'terminals' | 'code' | 'agents' | 'backup' | 'latex' | 'jobs' | 'usage' |
  'files' |
  'permissions' | 'skills' | 'schedules' | 'globus'

/** experiment: shown only while that experimental part is on in Settings. */
export type Item = { page: Page; title: string; icon: LucideIcon; experiment?: keyof Experiments }

export const HOME: Item = { page: 'clusters', title: 'Clusters', icon: Server }

export const GROUPS: [string, Item[]][] = [
  ['Work', [
    { page: 'projects', title: 'Projects', icon: LayoutGrid },
    { page: 'terminals', title: 'Terminals', icon: SquareTerminal },
    { page: 'code', title: 'Code', icon: FileCode2 },
    { page: 'agents', title: 'Agents', icon: Bot },
    { page: 'latex', title: 'Papers', icon: FileText, experiment: 'papers' },
  ]],
  ['Cluster', [
    { page: 'jobs', title: 'Jobs', icon: ListChecks },
    { page: 'usage', title: 'Usage', icon: Gauge },
  ]],
  ['Data', [
    { page: 'files', title: 'Files', icon: FolderOpen },
  ]],
]
