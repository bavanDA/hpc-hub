import type { SortKey } from './format'

/** hide: the container width under which the column goes. */
export type Column = { key: SortKey; title: string; right?: boolean; hide?: string; grow?: boolean }
export type Sort = { key: SortKey; desc: boolean }

export const NUMBERS = new Set<SortKey>(['id', 'time', 'res', 'su'])  // tabular figures here only: they widen hyphens

export const COLUMNS: Column[] = [
  { key: 'id', title: 'ID' },
  { key: 'name', title: 'Name', grow: true },
  { key: 'user', title: 'User', hide: '@max-[760px]:hidden' },
  { key: 'state', title: 'State' },
  { key: 'time', title: 'Time used' },
  { key: 'res', title: 'CPUs · memory', right: true, hide: '@max-[940px]:hidden' },
  { key: 'su', title: 'Hours (SU)', right: true, hide: '@max-[1000px]:hidden' },
  { key: 'where', title: 'Node or reason', hide: '@max-[640px]:hidden' },
]
