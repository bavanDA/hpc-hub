// One project, the desktop's table row stacked for a phone: name and folder, Open, Copy or sync and ⋮, and the other
// columns on a line under them.
import { ClipboardCopy, Copy, FileText, Folder, Pencil, MoreVertical, Trash2 } from 'lucide-react'

import { clusterOf, openedText } from '@shared/components/projects/format'
import type { Live } from '@shared/components/projects/live'
import type { Project } from '@shared/types/projects'
import { Button, IconBtn, Menu, StatusDot } from '../../ui'

export type RowActions = {
  show: (p: Project) => void; copy: (p: Project) => void; edit: (p: Project) => void
  copyPath: (p: Project) => void; remove: (p: Project) => void
}

export function ProjectRow({ p, live, act }: { p: Project; live: Live; act: RowActions }) {
  const known = Boolean(p.cluster_name)
  const running = live.running(p)
  const Icon = p.main_tex ? FileText : Folder
  const opened = openedText(p.opened)
  return (
    <div className="border-b border-line py-2 pr-1 pl-4">
      <div className="flex items-start gap-1">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2.5 font-medium">
            <Icon size={18} className="shrink-0 text-dim" />
            <span className="min-w-0 [overflow-wrap:anywhere]">{p.name}</span>
          </div>
          {/* cut at the start when narrow: the end names the folder */}
          <div className="truncate pl-7 text-left text-sm text-dim [direction:rtl]"><bdi>{p.path}</bdi></div>
        </div>
        <span className="flex shrink-0 items-center">
          {known && <Button small onClick={() => act.show(p)}>Open</Button>}
          {known && <IconBtn icon={Copy} label="Copy or sync" small onClick={() => act.copy(p)} />}
          <Menu label={`More for ${p.name}`} trigger={<MoreVertical size={18} />}
            className="grid size-9 shrink-0 place-items-center rounded-md text-dim active:bg-pressed"
            groups={[[
              { label: 'Edit', icon: Pencil, onClick: () => act.edit(p) },
              { label: 'Copy path', icon: ClipboardCopy, onClick: () => act.copyPath(p) },
            ], [{ label: 'Remove from the list', icon: Trash2, danger: true, onClick: () => act.remove(p) }]]} />
        </span>
      </div>
      <div className="flex flex-wrap items-center gap-x-3 py-0.5 pr-3 pl-7 text-sm">
        {known ? <span>{clusterOf(p)}</span> : <span className="text-dim">Not set up</span>}
        <span className="text-dim">{p.group || 'Yours'}</span>
        {opened && <span className="text-dim">{opened}</span>}
        {running > 0 && <span className="ml-auto flex items-center gap-1.5 font-medium"><StatusDot tone="on" />{running} running</span>}
      </div>
    </div>
  )
}
