// Add a folder that is already on a cluster, create a new project from a template, or edit one.
import { useState } from 'react'

import { call } from '../../rpc'
import { TEMPLATES, type Place, type Project, type ProjectCluster } from '../../types/projects'
import { Button, Dialog, Spinner } from '../ui'
import { FolderPicker } from './FolderPicker'
import { EntryRow, ErrorText, Group, PropertyRow, SelectRow, SwitchRow } from './form'

export type Mode = 'add' | 'new' | 'edit'

const slug = (name: string) => name.trim().replace(/[^\p{L}\p{N}_.-]+/gu, '-').replace(/^-+|-+$/g, '') || 'project'

export function ProjectDialog({ mode, project, clusters, projects, onClose, onSaved }:
  { mode: Mode; project?: Project; clusters: ProjectCluster[]; projects: Project[]; onClose: () => void;
    onSaved: (p: Project, created: boolean) => void }) {
  const create = mode === 'new'
  const first = clusters.find((c) => c.connected) ?? clusters[0]
  const [name, setName] = useState(project?.name ?? '')
  const [cluster, setCluster] = useState(project?.cluster ?? first?.id ?? '')
  const [path, setPath] = useState(project?.path ?? (create ? '~' : ''))
  const [template, setTemplate] = useState<string>(TEMPLATES[0])
  const [git, setGit] = useState(true)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [picking, setPicking] = useState(false)
  const c = clusters.find((x) => x.id === cluster)
  const target = create ? `${(path.trim() || '~').replace(/\/+$/, '')}/${slug(name)}` : path.trim()

  const browse = () => {
    if (!c) return
    if (!c.connected) setError(`Connect to ${c.name} on the Clusters page first. Then choose the folder.`)
    else { setError(''); setPicking(true) }
  }

  const picked = (p: string) => {
    setPath(p)
    if (!create && !name.trim()) setName(p.replace(/\/+$/, '').split('/').pop() ?? '')
    setError('')
  }

  const save = () => {
    if (!name.trim()) return setError('Give the project a name')
    if (!target) return setError('Choose a folder')
    if (!c) return setError('Pick a cluster')
    if (create && !c.connected) return setError(`Connect to ${c.name} first to create the folder`)
    setBusy(true)
    setError('')
    const req = create ? call<Project>('projects.create', { cluster, parent: path.trim() || '~', name, template, git })
      : mode === 'edit' ? call<Project>('projects.update', { id: project!.id, name, cluster, path: target })
        : call<Project>('projects.add', { name, cluster, path: target })
    req.then((p) => onSaved(p, create)).catch((e: Error) => setError(e.message)).finally(() => setBusy(false))
  }

  const mine: Place[] = projects.filter((p) => p.cluster === cluster).map((p) => ({ label: p.name, path: p.path }))
  const title = create ? 'New project' : mode === 'edit' ? 'Edit project' : 'Add folder as project'
  return (
    <>
      <Dialog title={title} onClose={picking ? () => {} : onClose} width={560}
        actions={<>
          {busy && <Spinner />}
          <Button onClick={onClose}>Cancel</Button>
          <Button kind="suggested" disabled={busy} onClick={save}>{create ? 'Create' : 'Save'}</Button>
        </>}>
        <form className="flex flex-col gap-5 pt-1 pb-2" onSubmit={(e) => { e.preventDefault(); save() }}>
          <Group>
            <EntryRow title="Name (e.g. myproj, thesis)" value={name} onChange={setName} autoFocus />
            <SelectRow title="Cluster" value={cluster} options={clusters.map((x) => ({
              value: x.id, label: x.connected ? x.name : `${x.name} (not connected)` }))}
              onChange={(v) => { setCluster(v); setPath(create ? '~' : ''); setError('') }} />
            <EntryRow title={create ? 'Create inside' : 'Folder'} value={path} onChange={setPath} mono
              suffix={<Button type="button" onClick={browse}>Choose…</Button>} />
          </Group>
          {create && (
            <Group>
              <SelectRow title="Start with" value={template} onChange={setTemplate}
                options={TEMPLATES.map((t) => ({ value: t, label: t }))} />
              <SwitchRow title="Make it a git repository" on={git} onChange={setGit} />
              <PropertyRow title="Will create" value={<span className="font-mono text-[14px]">{target}</span>} />
            </Group>
          )}
          {!create && c && !c.connected && !error && (
            <p className="px-1 text-[13px] text-dim">
              {c.name} is not connected. The folder is checked the first time you open the project.</p>
          )}
          <ErrorText text={error} />
          <button type="submit" hidden />
        </form>
      </Dialog>
      {picking && c && (
        <FolderPicker cluster={c} start={path.trim() || '~'} projects={mine} onPick={picked}
          onClose={() => setPicking(false)} />
      )}
    </>
  )
}
