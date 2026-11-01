// Add a folder that is already on a cluster, create a new project from a template, or edit one. Same calls as the
// desktop's ProjectDialog (projects.add, projects.create, projects.update).
import { useState } from 'react'

import { Spinner } from '@shared/components/ui'
import { call } from '@shared/rpc'
import { TEMPLATES, type Place, type Project, type ProjectCluster } from '@shared/types/projects'
import { Button, Field, ListRow, PickerSheet, Sheet, Switch } from '../../ui'
import { FolderPicker } from './FolderPicker'

export type Mode = 'add' | 'new' | 'edit'

const slug = (name: string) => name.trim().replace(/[^\p{L}\p{N}_.-]+/gu, '-').replace(/^-+|-+$/g, '') || 'project'

export function ProjectSheet({ mode, project, clusters, projects, onClose, onSaved }:
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
  const [open, setOpen] = useState<'' | 'cluster' | 'template' | 'folder'>('')
  const c = clusters.find((x) => x.id === cluster)
  const target = create ? `${(path.trim() || '~').replace(/\/+$/, '')}/${slug(name)}` : path.trim()

  const browse = () => {
    if (!c) return
    if (!c.connected) setError(`Connect to ${c.name} on Clusters first, then choose the folder.`)
    else { setError(''); setOpen('folder') }
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
  const title = create ? 'New project' : mode === 'edit' ? 'Edit project' : 'Add a folder'
  return (
    <>
      <Sheet title={title} onClose={onClose} actions={<>
        <Button className="flex-1" onClick={onClose}>Cancel</Button>
        <Button kind="primary" className="flex-1" disabled={busy} onClick={save}>
          {busy ? <Spinner /> : create ? 'Create' : 'Save'}</Button></>}>
        {/* only the name is in the form: Enter there saves, and the rows' buttons below don't submit */}
        <form onSubmit={(e) => { e.preventDefault(); save() }}>
          <Field label="Name" value={name} placeholder="myproj, thesis…" autoCapitalize="none"
            onChange={(e) => setName(e.target.value)} />
          <button type="submit" hidden />
        </form>
        <div className="divide-y divide-line">
          <ListRow title="Cluster" subtitle={c ? (c.connected ? c.name : `${c.name}, not connected`) : 'Pick one'}
            onClick={() => setOpen('cluster')} />
          <ListRow title={create ? 'Create inside' : 'Folder'}
            subtitle={<span className="font-mono">{path.trim() || 'Choose a folder'}</span>}
            onClick={browse} />
          {create && <>
            <ListRow title="Start with" subtitle={template} onClick={() => setOpen('template')} />
            <Switch label="Make it a git repository" checked={git} onChange={setGit} />
          </>}
        </div>
        {create && name.trim() && (
          <p className="mt-3 text-sm text-dim">Will create <span className="font-mono">{target}</span></p>
        )}
        {!create && c && !c.connected && !error && (
          <p className="mt-3 text-sm text-dim">
            {c.name} is not connected. The folder is checked the first time you open the project.</p>
        )}
        {error && <p className="mt-3 select-text rounded-xl bg-bad-bg p-3 text-bad">{error}</p>}
      </Sheet>

      {open === 'cluster' && (
        <PickerSheet title="Cluster" value={cluster} onClose={() => setOpen('')}
          onPick={(v) => { setCluster(v); setPath(create ? '~' : ''); setError('') }}
          options={clusters.map((x) => ({ value: x.id, label: x.name, hint: x.connected ? 'Connected' : 'Not connected' }))} />
      )}
      {open === 'template' && (
        <PickerSheet title="Start with" value={template} onClose={() => setOpen('')} onPick={setTemplate}
          options={TEMPLATES.map((t) => ({ value: t, label: t }))} />
      )}
      {open === 'folder' && c && (
        <FolderPicker cluster={c} start={path.trim() || '~'} projects={mine} onPick={picked}
          onClose={() => setOpen('')} />
      )}
    </>
  )
}
