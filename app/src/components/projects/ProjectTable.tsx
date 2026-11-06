import { ChevronDown, ChevronUp, ClipboardCopy, Copy, EllipsisVertical, FileText, Folder, GitBranch, Pencil,
  Trash2 } from 'lucide-react'
import type { Project } from '../../types/projects'
import { EButton } from '../e/EButton'
import { StatusDot } from '../e/StatusDot'
import { clusterOf, openedText, type Sort, type SortKey } from './format'
import type { Live } from './live'
import { Menu } from './Menu'

export type RowActions = {
  show: (p: Project) => void  // the Open window
  copy: (p: Project) => void
  edit: (p: Project) => void
  copyPath: (p: Project) => void
  remove: (p: Project) => void
}


type Column = { key: SortKey | 'group' | 'running' | 'git'; title: string; hide?: string }
// hide: the container width under which the column goes
const COLUMNS: Column[] = [
  { key: 'name', title: 'Name and folder' },
  { key: 'cluster', title: 'Cluster', hide: '@max-[540px]:hidden' },
  { key: 'group', title: 'Group', hide: '@max-[760px]:hidden' },
  { key: 'opened', title: 'Last opened', hide: '@max-[620px]:hidden' },
  { key: 'running', title: 'Running', hide: '@max-[860px]:hidden' },
  { key: 'git', title: 'Git', hide: '@max-[1000px]:hidden' },
]
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

function ProjectRow({ p, live, act }: { p: Project; live: Live; act: RowActions }) {
  const known = Boolean(p.cluster_name)
  const running = live.running(p)
  const git = live.git(p)
  const Icon = p.main_tex ? FileText : Folder
  const cell = (c: Column) => {
    switch (c.key) {
      case 'name': return (
        <div className="min-w-0 py-2">
          <div className="flex items-center gap-2.5 font-medium">
            <Icon size={18} className="shrink-0 text-dim" />
            <span className="min-w-0 [overflow-wrap:anywhere]">{p.name}</span>
          </div>
          {/* cut at the start when narrow: the end names the folder */}
          <div className="truncate pl-[28px] text-left text-sm text-dim [direction:rtl]" title={p.path}>
            <bdi>{p.path}</bdi></div>
        </div>)
      case 'cluster': return known ? clusterOf(p)
        : <span className="text-dim" title={`${p.cluster} is not set up in HPC Hub`}>Not set up</span>
      case 'group': return p.group || <span className="text-dim">Yours</span>
      case 'opened': return openedText(p.opened)
      case 'running': return running > 0 &&
        <span className="flex items-center gap-2"><StatusDot tone="on" />{running} running</span>
      case 'git': return git && (
        <span className="flex items-center gap-1.5 text-sm text-dim">
          <GitBranch size={14} className="shrink-0" />
          <span className="max-w-[140px] truncate" title={git.branch}>{git.branch}</span>
          {git.changed > 0 && <span className="shrink-0">· {git.changed} changed</span>}
        </span>)
    }
  }
  return (
    <tr className="border-b border-line hover:bg-hover">
      {COLUMNS.map((c, i) => (
        <td key={c.key} className={`px-3 ${i ? 'whitespace-nowrap' : 'max-w-0 min-w-[180px]'} ${c.hide ?? ''}`}>
          {cell(c)}</td>
      ))}
      <td className="pr-1 pl-2">
        <div className="flex items-center justify-end gap-1">
          {known && <EButton small onClick={() => act.show(p)}>Open</EButton>}
          {known && <EButton small icon={Copy} aria-label="Copy or sync" title="Copy or sync" className="@max-[1160px]:px-2"
            onClick={() => act.copy(p)}><span className="@max-[1160px]:hidden">Copy or sync</span></EButton>}
          <Menu label={`More for ${p.name}`} className="grid size-9 place-items-center rounded-md text-dim
            hover:bg-hover hover:text-text" trigger={<EllipsisVertical size={18} />}
            groups={[[
              { label: 'Edit', icon: Pencil, onClick: () => act.edit(p) },
              { label: 'Copy path', icon: ClipboardCopy, onClick: () => act.copyPath(p) },
            ], [{ label: 'Remove from the list', icon: Trash2, danger: true, onClick: () => act.remove(p) }]]} />
        </div>
      </td>
    </tr>
  )
}
