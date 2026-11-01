// What a project offers when you tap it. Code, Files and LaTeX open their screens here; the agents, Ask all and
// VS Code open on the Agents screen with the project's folder: go('agents', { cluster, folder, start }), where start
// is the desktop's open-menu key (agent:claude, ask, vscode:browser). Anything that needs the cluster connects first.
import {
  ArrowRightLeft, ClipboardCopy, FileCode, FileText, FolderOpen, Globe, MessageSquare, MousePointer2, Pencil,
  Rocket, Sparkles, Trash2, Users,
} from 'lucide-react'

import { whenConnected } from '@shared/components/tools/run'
import { useGo } from '@shared/nav'
import { call } from '@shared/rpc'
import type { Project } from '@shared/types/projects'
import { ActionSheet, type SheetAction } from '../../ui'

export type Act = { copy: (p: Project) => void; edit: (p: Project) => void; copyPath: (p: Project) => void;
  remove: (p: Project) => void; failed: (text: string) => void }

export function ProjectActions({ p, experimental, act, onClose }:
  { p: Project; experimental: boolean; act: Act; onClose: () => void }) {
  const go = useGo()
  const known = Boolean(p.cluster_name)

  /** Connect if needed, then the project's folder with ~ expanded (projects.opened also bumps it in the list). */
  const where = async () => {
    await whenConnected(p.cluster, p.cluster_name)
    return call<Project>('projects.opened', { id: p.id }).then((x) => x.path, () => p.path)
  }
  const open = (page: 'code' | 'files') => () =>
    where().then((path) => go(page, { cluster: p.cluster, path })).catch((e: Error) => act.failed(e.message))
  const start = (key: string) => () =>
    where().then((folder) => go('agents', { cluster: p.cluster, folder, start: key }))
      .catch((e: Error) => act.failed(e.message))
  const paper = () => go('latex', { cluster: p.cluster,
    path: p.main_tex ? `${p.path.replace(/\/$/, '')}/${p.main_tex}` : p.path })

  const tools: SheetAction[] = known ? [
    { label: 'Code', icon: FileCode, onPick: open('code') },
    { label: 'Files', icon: FolderOpen, onPick: open('files') },
    { label: 'Claude', icon: Sparkles, onPick: start('agent:claude') },
    { label: 'ChatGPT', icon: MessageSquare, onPick: start('agent:codex') },
    { label: 'Antigravity', icon: Rocket, onPick: start('agent:agy') },
    { label: 'Cursor', icon: MousePointer2, onPick: start('agent:cursor') },
    { label: 'Ask all agents', icon: Users, onPick: start('ask') },
    { label: 'VS Code in the browser', icon: Globe, onPick: start('vscode:browser') },
    ...(experimental ? [{ label: 'LaTeX', icon: FileText, onPick: paper }] : []),
    { label: 'Copy to another cluster', icon: ArrowRightLeft, onPick: () => act.copy(p) },
  ] : []
  const rest: SheetAction[] = [
    { label: 'Edit', icon: Pencil, onPick: () => act.edit(p) },
    { label: 'Copy path', icon: ClipboardCopy, onPick: () => act.copyPath(p) },
    { label: 'Remove from the list', icon: Trash2, danger: true, onPick: () => act.remove(p) },
  ]
  return <ActionSheet title={p.name} actions={[...tools, ...rest]} onClose={onClose} />
}
