import { ChevronDown, ChevronUp } from 'lucide-react'

import type { Project } from '../../types/projects'
import { COLUMNS } from './columns'
import type { Sort, SortKey } from './format'
import type { Live } from './live'
import { ProjectRow } from './ProjectRow'

export type RowActions = {
  show: (p: Project) => void  // the Open window
  copy: (p: Project) => void
  edit: (p: Project) => void
  copyPath: (p: Project) => void
  remove: (p: Project) => void
}


const SORTED = new Set<string>(['name', 'cluster', 'opened'])

export function ProjectTable({ projects, sort, onSort, live, act }: {
  projects: Project[]; sort: Sort; onSort: (s: Sort) => void; live: Live; act: RowActions
}) {
  return (
    <table className="w-full border-collapse">
      <thead className="shadow-[inset_0_1px_0_var(--color-line),inset_0_-1px_0_var(--color-line)]">
        <tr className="text-left text-xs font-semibold text-dim">
          {COLUMNS.map((c, i) => (
            <th key={c.key} aria-sort={sort.key === c.key ? (sort.desc ? 'descending' : 'ascending') : undefined}
              className={`p-0 font-semibold ${i ? '' : 'w-full'} ${c.hide ?? ''}`}>
              {SORTED.has(c.key) ? (
                <button onClick={() => onSort({ key: c.key as SortKey,
                  desc: sort.key === c.key ? !sort.desc : c.key === 'opened' })}
                  className={`flex h-9 w-full items-center gap-1 px-3 whitespace-nowrap hover:text-text
                    ${sort.key === c.key ? 'text-text' : ''}`}>
                  {c.title}
                  {sort.key === c.key && (sort.desc ? <ChevronDown size={14} /> : <ChevronUp size={14} />)}
                </button>
              ) : <span className="flex h-9 items-center px-3 whitespace-nowrap">{c.title}</span>}
            </th>
          ))}
          <th aria-label="Actions" />
        </tr>
      </thead>
      <tbody>
        {projects.map((p) => <ProjectRow key={p.id} p={p} live={live} act={act} />)}
      </tbody>
    </table>
  )
}
