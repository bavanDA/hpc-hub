// One project as a style E row: Open (a window with Code, Files, Terminal, VS Code, the agents, LaTeX) and ⋮ with
// the rest.
import { EllipsisVertical, FileText, Folder } from 'lucide-react'
import { useState } from 'react'

import { call } from '../../rpc'
import type { Project } from '../../types/projects'
import { shortName } from '../clusters/loginCopy'
import { ItemRow } from '../e/extra'
import { OpenDialog } from '../tools/OpenDialog'
import { Menu } from './Menu'

export type RowActions = {
  open: (p: Project, key: string) => void
  copy: (p: Project) => void
  edit: (p: Project) => void
  copyPath: (p: Project) => void
  remove: (p: Project) => void
}

export function ProjectRow({ p, experimental, act }: { p: Project; experimental: boolean; act: RowActions }) {
  const known = Boolean(p.cluster_name)
  const [opening, setOpening] = useState(false)
  return (
    <>
      <ItemRow icon={p.main_tex ? FileText : Folder} label={p.name} title={p.path}
        sub={<span className="break-all">{known ? shortName({ name: p.cluster_name }) : `${p.cluster}, not set up`}
          {' · '}{p.path}</span>}
        trailing={known && <>
          <button type="button" onClick={() => setOpening(true)} className="flex h-8 items-center rounded-lg border
            border-line-strong px-3 text-sm font-semibold hover:bg-hover">Open</button>
          <Menu label={`More for ${p.name}`} className="grid size-9 place-items-center rounded-md text-dim hover:bg-hover"
            trigger={<EllipsisVertical size={18} />}
            groups={[[
              { label: 'Copy or sync to another cluster', onClick: () => act.copy(p) },
              { label: 'Edit', onClick: () => act.edit(p) },
              { label: 'Copy path', onClick: () => act.copyPath(p) },
            ], [{ label: 'Remove from the list', danger: true, onClick: () => act.remove(p) }]]} />
        </>} />
      {/* opened also moves the project up the list */}
      {opening && <OpenDialog name={p.name} cluster={p.cluster} clusterName={p.cluster_name} folder={p.path}
        prepare={() => call<Project>('projects.opened', { id: p.id }).then((x) => x.path, () => p.path)}
        extra={experimental ? [{ label: 'LaTeX', icon: FileText, onPick: () => act.open(p, 'latex') }] : []}
        onClose={() => setOpening(false)} />}
    </>
  )
}
