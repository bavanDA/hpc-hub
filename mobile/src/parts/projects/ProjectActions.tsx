// Open a project: the desktop's Open window. Where each thing opens is in openIn.ts; agents start on the Agents page,
// which is where a phone keeps them.
import { FileText } from 'lucide-react'

import { useGo } from '@shared/nav'
import { call } from '@shared/rpc'
import type { Project } from '@shared/types/projects'
import { Dialog, List, Row, Section } from '../../ui'
import { useOpenIn } from './openIn'

export function OpenProject({ p, experimental, failed, onClose }:
  { p: Project; experimental: boolean; failed: (text: string) => void; onClose: () => void }) {
  const go = useGo()
  const openIn = useOpenIn()
  // projects.opened also moves it up the list
  const opened = () => call<Project>('projects.opened', { id: p.id }).then((x) => x.path, () => p.path)
  const paper = () => go('latex', { cluster: p.cluster,
    path: p.main_tex ? `${p.path.replace(/\/$/, '')}/${p.main_tex}` : p.path })
  const places = openIn({ cluster: p.cluster, clusterName: p.cluster_name, folder: p.path, prepare: opened }, failed)
  const row = (a: (typeof places)[number]) => (
    <Row key={a.label} icon={a.icon} label={a.label} opens onPress={() => { onClose(); a.onPick() }} />
  )
  return (
    <Dialog title={`Open ${p.name}`} width={440} onClose={onClose}>
      <List>{places.slice(0, 4).map(row)}</List>
      <Section title="Agents">{places.slice(4).map(row)}</Section>
      {experimental && <div className="pt-5"><List>
        <Row icon={FileText} label="LaTeX" opens onPress={() => { onClose(); paper() }} />
      </List></div>}
    </Dialog>
  )
}
