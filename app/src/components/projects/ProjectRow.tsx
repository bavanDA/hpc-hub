// One project in the list: its Open menu (VS Code, Files, agents, LaTeX) and the ⋮ menu, like the GTK rows.
import {
  ChevronDown, Code, EllipsisVertical, FileText, Folder, FolderOpen, Globe, LayoutGrid, MessageSquare,
  MousePointer2, Rocket, Sparkles, Users,
} from 'lucide-react'

import { call } from '../../rpc'
import type { Project } from '../../types/projects'
import { useTools } from '../tools/useTools'
import { Menu, type MenuItem } from './Menu'

/** What Open can open; the keys match the GTK open_menu (vscode:<target>, files, ask, agent:<id>, latex). */
function openGroups(open: (key: string) => void, experimental: boolean): MenuItem[][] {
  const item = (key: string, label: string, icon: MenuItem['icon']) => ({ label, icon, onClick: () => open(key) })
  return [
    [item('vscode:desktop', 'VS Code app', Code), item('vscode:browser', 'VS Code in browser', Globe),
      item('files', 'Files', FolderOpen)],
    [item('ask', 'Ask all agents', Users), item('agent:claude', 'Claude', Sparkles),
      item('agent:codex', 'ChatGPT', MessageSquare), item('agent:agy', 'Antigravity', Rocket),
      item('agent:cursor', 'Cursor', MousePointer2)],
    experimental ? [item('latex', 'LaTeX', FileText)] : [],
  ]
}

export type RowActions = {
  open: (p: Project, key: string) => void
  copy: (p: Project) => void
  edit: (p: Project) => void
  copyPath: (p: Project) => void
  remove: (p: Project) => void
}

export function ProjectRow({ p, experimental, act }: { p: Project; experimental: boolean; act: RowActions }) {
  const known = Boolean(p.cluster_name)
  const Icon = p.main_tex ? FileText : Folder
  const tools = useTools()
  // VS Code, Files and the agents open here (connecting first); the page gets the rest (LaTeX)
  const open = (key: string) => key === 'latex' ? act.open(p, key) : tools.open(p.cluster, p.cluster_name, key, p.path,
    () => call<Project>('projects.opened', { id: p.id }).then((x) => x.path, () => p.path))
  return (
    <div className="flex min-h-[56px] items-center gap-3 py-2 pr-3 pl-4">
      <Icon size={20} strokeWidth={1.75} className="shrink-0" />
      <div className="min-w-0 flex-1">
        <div className="truncate">{p.name}</div>
        <div className="truncate text-sm text-dim" title={p.path}>
          {known ? p.cluster_name : `${p.cluster} (unknown cluster)`} · {p.path}
        </div>
      </div>
      {known && (
        <div className="flex shrink-0 items-center gap-1">
          <Menu label="VS Code, Claude and more" groups={openGroups(open, experimental)}
            className="flex h-9 items-center gap-2 rounded-md bg-pill px-3 font-semibold hover:bg-selected"
            trigger={<><LayoutGrid size={14} /> Open <ChevronDown size={16} /></>} />
          <Menu label="More" className="grid size-9 place-items-center rounded-full hover:bg-hover"
            trigger={<EllipsisVertical size={20} />}
            groups={[[
              { label: 'Copy or sync to another cluster', onClick: () => act.copy(p) },
              { label: 'Edit', onClick: () => act.edit(p) },
              { label: 'Copy path', onClick: () => act.copyPath(p) },
              { label: 'Remove from list', onClick: () => act.remove(p) },
            ]]} />
        </div>
      )}
      {tools.dialog}
    </div>
  )
}
