// Add a folder that is already on a cluster, create a new project from a template, or edit one. Same calls as the
// desktop's ProjectDialog (projects.add, projects.create, projects.update).
import { useState } from 'react'

import { Spinner } from '@shared/components/ui'
import { call } from '@shared/rpc'
import { TEMPLATES, type Place, type Project, type ProjectCluster } from '@shared/types/projects'
import { Field, MainButton, PickerSheet, Row, Sheet, ToggleRow } from '../../ui'
import { shortCluster, wrapPath } from '../code/util'
import { FolderPicker, folderText } from './FolderPicker'

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
    if (!c.connected) setError(`Connect to ${shortCluster(c.name)} on Clusters first.`)
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
    if (create && !c.connected) return setError(`Connect to ${shortCluster(c.name)} first`)
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
      <Sheet flush title={title} onClose={onClose} actions={
        <MainButton disabled={busy} onClick={save}>{busy ? <Spinner /> : create ? 'Create' : 'Save'}</MainButton>}>
        {/* only the name is in the form: Enter there saves, and the rows' buttons below don't submit */}
        <form className="px-4 pb-3" onSubmit={(e) => { e.preventDefault(); save() }}>
          <Field label="Name" value={name} placeholder="myproj, thesis…" autoCapitalize="none"
            onChange={(e) => setName(e.target.value)} />
          <button type="submit" hidden />
        </form>
        <div className="border-t border-line">
          <Row label="Cluster" opens onPress={() => setOpen('cluster')}
            value={c ? (c.connected ? shortCluster(c.name) : `${shortCluster(c.name)}, not connected`) : 'Pick one'} />
          <Row label={create ? 'Inside' : 'Folder'} opens onPress={browse}
            value={path.trim() ? folderText(path.trim()) : 'Choose'} />
          {create && <>
            <Row label="Start with" value={template} opens onPress={() => setOpen('template')} />
            <ToggleRow label="Git repository" checked={git} onChange={setGit} />
          </>}
        </div>
        {create && name.trim() && (
          <p className="px-4 pt-2 text-sm text-dim">Makes <span className="font-mono break-words">{wrapPath(target)}</span></p>
        )}
        {error && <p className="px-4 pt-3 select-text text-bad">{error}</p>}
      </Sheet>

      {open === 'cluster' && (
        <PickerSheet title="Cluster" value={cluster} onClose={() => setOpen('')}
          onPick={(v) => { setCluster(v); setPath(create ? '~' : ''); setError('') }}
          options={clusters.map((x) => ({ value: x.id, label: shortCluster(x.name), hint: x.connected ? 'Connected' : 'Not connected' }))} />
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
