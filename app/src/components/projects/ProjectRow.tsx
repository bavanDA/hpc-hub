// One project as a style E row: its Open menu (Code, VS Code, Files, the agents, LaTeX) and ⋮ with the rest.
import {
  ChevronDown, Code, EllipsisVertical, FileCode2, FileText, Folder, FolderOpen, Globe, MessagesSquare,
} from 'lucide-react'

import { useGo } from '../../nav'
import { call } from '../../rpc'
import type { Project } from '../../types/projects'
import { agentIcon } from '../agents/AgentIcon'
import { shortName } from '../clusters/loginCopy'
import { ItemRow } from '../e/extra'
import { useTools } from '../tools/useTools'
import { Menu, type MenuItem } from './Menu'

/** What Open can open; the keys match the GTK open_menu (vscode:<target>, files, ask, agent:<id>, latex), plus code
 * (the Code page with the project's folder in its tree). */
function openGroups(open: (key: string) => void, experimental: boolean): MenuItem[][] {
  const item = (key: string, label: string, icon: MenuItem['icon']) => ({ label, icon, onClick: () => open(key) })
  return [
    [item('code', 'Code', FileCode2), item('vscode:desktop', 'VS Code app', Code),
      item('vscode:browser', 'VS Code in the browser', Globe), item('files', 'Files', FolderOpen)],
    [item('agent:claude', 'Claude', agentIcon('claude')), item('agent:codex', 'ChatGPT', agentIcon('codex')),
      item('agent:agy', 'Antigravity', agentIcon('agy')), item('agent:cursor', 'Cursor', agentIcon('cursor')),
      item('ask', 'Ask all agents', MessagesSquare)],
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
  const tools = useTools()
  const go = useGo()
  // VS Code, Files and the agents open here (connecting first); the page gets the rest (LaTeX)
  const open = (key: string) => {
    if (key === 'code') {
      call('projects.opened', { id: p.id }).catch(() => {})
      go('code', { cluster: p.cluster, folder: p.path })
      return
    }
    if (key === 'latex') act.open(p, key)
    else tools.open(p.cluster, p.cluster_name, key, p.path,
      () => call<Project>('projects.opened', { id: p.id }).then((x) => x.path, () => p.path))
  }
  return (
    <>
      <ItemRow icon={p.main_tex ? FileText : Folder} label={p.name} title={p.path}
        sub={<span className="break-all">{known ? shortName({ name: p.cluster_name }) : `${p.cluster}, not set up`}
          {' · '}{p.path}</span>}
        trailing={known && <>
          <Menu label="Open in Code, VS Code, an agent and more" groups={openGroups(open, experimental)}
            className="flex h-8 items-center gap-1.5 rounded-lg border border-line-strong px-3 text-sm font-semibold
              hover:bg-hover"
            trigger={<>Open<ChevronDown size={15} className="text-dim" /></>} />
          <Menu label={`More for ${p.name}`} className="grid size-9 place-items-center rounded-md text-dim hover:bg-hover"
            trigger={<EllipsisVertical size={18} />}
            groups={[[
              { label: 'Copy or sync to another cluster', onClick: () => act.copy(p) },
              { label: 'Edit', onClick: () => act.edit(p) },
              { label: 'Copy path', onClick: () => act.copyPath(p) },
            ], [{ label: 'Remove from the list', danger: true, onClick: () => act.remove(p) }]]} />
        </>} />
      {tools.dialog}
    </>
  )
}
