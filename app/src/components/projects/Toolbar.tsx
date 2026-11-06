import { FolderOpen, Plus } from 'lucide-react'

import type { ProjectCluster } from '../../types/projects'
import { shortName } from '../clusters/loginCopy'
import { EButton, SearchField } from '../e/extra'
import { Segments } from '../e/ui'
import { Select } from '../jobs/Select'
import { ALL, YOURS } from './filter'

export function Toolbar({ places, at, onWhere, groups, inGroup, onGroup, query, onQuery, onAdd, onCreate }: {
  places: ProjectCluster[]; at: string; onWhere: (id: string) => void
  groups: string[]; inGroup: string; onGroup: (g: string) => void
  query: string; onQuery: (q: string) => void; onAdd: () => void; onCreate: () => void
}) {
  return (
    <div className="flex flex-wrap items-center gap-2.5 pb-4">
      {places.length > 1 && <Segments fit label="Cluster" value={at} onChange={onWhere}
        options={[[ALL, 'All'], ...places.map((c) => [c.id, shortName(c)] as const)]} />}
      {groups.length > 1 && <div className="ml-auto"><Select label="Group" value={inGroup} onChange={onGroup}
        options={[[ALL, 'Group: All'], ...groups.map((g) => [g, g === YOURS ? 'Yours' : g] as const)]} /></div>}
      <div className={`${groups.length > 1 ? '' : 'ml-auto '}w-[240px] min-w-[140px] shrink`}>
        <SearchField value={query} onChange={onQuery} placeholder="Search projects" />
      </div>
      <EButton icon={FolderOpen} onClick={onAdd} title="Use a folder that is already on a cluster"
        aria-label="Add folder" className="@max-[860px]:px-3">
        <span className="@max-[860px]:hidden">Add folder</span></EButton>
      <EButton kind="primary" icon={Plus} onClick={onCreate}>New project</EButton>
    </div>
  )
}
