// What a project offers when you tap it: where to open its folder (openIn.ts), LaTeX, and the rest.
import { ArrowRightLeft, ClipboardCopy, FileText, Pencil, Trash2 } from 'lucide-react'

import { useGo } from '@shared/nav'
import { call } from '@shared/rpc'
import type { Project } from '@shared/types/projects'
import { ActionSheet, type SheetAction } from '../../ui'
import { useOpenIn } from './openIn'

export type Act = { copy: (p: Project) => void; edit: (p: Project) => void; copyPath: (p: Project) => void;
  remove: (p: Project) => void; failed: (text: string) => void }

export function ProjectActions({ p, experimental, act, onClose }:
  { p: Project; experimental: boolean; act: Act; onClose: () => void }) {
  const go = useGo()
  const openIn = useOpenIn()
  const known = Boolean(p.cluster_name)

  // projects.opened also bumps it in the list
  const opened = () => call<Project>('projects.opened', { id: p.id }).then((x) => x.path, () => p.path)
  const paper = () => go('latex', { cluster: p.cluster,
    path: p.main_tex ? `${p.path.replace(/\/$/, '')}/${p.main_tex}` : p.path })

  const tools: SheetAction[] = known ? [
    ...openIn({ cluster: p.cluster, clusterName: p.cluster_name, folder: p.path, prepare: opened }, act.failed),
    ...(experimental ? [{ label: 'LaTeX', icon: FileText, onPick: paper }] : []),
    { label: 'Copy or sync to another cluster', icon: ArrowRightLeft, onPick: () => act.copy(p) },
  ] : []
  const rest: SheetAction[] = [
    { label: 'Edit', icon: Pencil, onPick: () => act.edit(p) },
    { label: 'Copy path', icon: ClipboardCopy, onPick: () => act.copyPath(p) },
    { label: 'Remove from the list', icon: Trash2, danger: true, onPick: () => act.remove(p) },
  ]
  return <ActionSheet title={p.name} actions={[...tools, ...rest]} onClose={onClose} />
}
