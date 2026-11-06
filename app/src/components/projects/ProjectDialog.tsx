import { FolderOpen } from 'lucide-react'
import { useState } from 'react'

import { call } from '../../rpc'
import { TEMPLATES, type Place, type Project, type ProjectCluster } from '../../types/projects'
import { shortName } from '../clusters/loginCopy'
import { ChoiceRow } from '../e/ChoiceRow'
import { EDialog } from '../e/EDialog'
import { Field } from '../e/Field'
import { List } from '../e/List'
import { MainButton } from '../e/MainButton'
import { ToggleRow } from '../e/ToggleRow'
import { Spinner } from '../ui'
import { FolderPicker } from './FolderPicker'

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
    if (!c.connected) setError(`Connect to ${shortName(c)} on Clusters first. Then choose the folder.`)
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
    if (create && !c.connected) return setError(`Connect to ${shortName(c)} first to make the folder`)
    setBusy(true)
    setError('')
    const req = create ? call<Project>('projects.create', { cluster, parent: path.trim() || '~', name, template, git })
      : mode === 'edit' ? call<Project>('projects.update', { id: project!.id, name, cluster, path: target })
        : call<Project>('projects.add', { name, cluster, path: target })
    req.then((p) => onSaved(p, create)).catch((e: Error) => setError(e.message)).finally(() => setBusy(false))
  }

  const mine: Place[] = projects.filter((p) => p.cluster === cluster).map((p) => ({ label: p.name, path: p.path }))
  const title = create ? 'New project' : mode === 'edit' ? 'Edit project' : 'Add a folder as a project'
  return (
    <>
      <EDialog title={title} width={540} onClose={picking ? () => {} : onClose}
        actions={<MainButton disabled={busy} onClick={save}>{busy && <Spinner size={16} />}
          {create ? 'Create' : 'Save'}</MainButton>}>
        <form className="px-5 pb-3" onSubmit={(e) => { e.preventDefault(); save() }}>
          <Field label="Name" value={name} placeholder="myproj, thesis" autoFocus
            onChange={(e) => setName(e.target.value)} />
          <button type="submit" hidden />
        </form>
        <List>
          <ChoiceRow label="Cluster" value={cluster}
            onChange={(v) => { setCluster(v); setPath(create ? '~' : ''); setError('') }}
            options={clusters.map((x) => ({ value: x.id, label: shortName(x),
              hint: x.connected ? 'Connected' : 'Not connected' }))} />
          {create && <>
            <ChoiceRow label="Start with" value={template} onChange={setTemplate}
              options={TEMPLATES.map((t) => ({ value: t, label: t }))} />
            <ToggleRow label="Make it a git repository" checked={git} onChange={setGit} />
          </>}
        </List>
        <div className="flex items-end gap-2 px-5 pt-3">
          <div className="min-w-0 flex-1">
            <Field label={create ? 'Make it inside' : 'Folder'} value={path} placeholder={create ? 'Home folder' : ''}
              onChange={(e) => setPath(e.target.value)} />
          </div>
          <button aria-label="Choose a folder" title="Choose a folder" onClick={browse}
            className="mb-1.5 grid size-10 shrink-0 place-items-center rounded-lg border border-line-strong
              hover:bg-hover active:bg-pressed"><FolderOpen size={18} className="text-dim" /></button>
        </div>
        {create && name.trim() && (
          <p className="px-5 pt-1 text-sm text-dim">Makes <span className="font-mono break-all">{target}</span></p>
        )}
        {!create && c && !c.connected && !error && (
          <p className="px-5 pt-1 text-sm text-dim">
            {shortName(c)} is not connected. The folder is checked the first time you open the project.</p>
        )}
        {error && <p className="px-5 pt-2 select-text text-bad">{error}</p>}
      </EDialog>
      {picking && c && (
        <FolderPicker cluster={c} start={path.trim() || '~'} projects={mine} onPick={picked}
          onClose={() => setPicking(false)} />
      )}
    </>
  )
}
