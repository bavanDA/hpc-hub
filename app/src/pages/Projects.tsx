// Projects: your named folders on the clusters. Open one in VS Code, an agent, Files or LaTeX; copy it elsewhere.
// Style E rows, like the phone's Projects.
import { Folder, FolderOpen, Plus } from 'lucide-react'
import { useState } from 'react'

import { Confirm, EButton, EmptyState, EPage, SearchField } from '../components/e/extra'
import { List } from '../components/e/ui'
import { CopyDialog } from '../components/projects/CopyDialog'
import { ProjectDialog, type Mode } from '../components/projects/ProjectDialog'
import { ProjectRow, type RowActions } from '../components/projects/ProjectRow'
import { Transfers } from '../components/projects/Transfers'
import { expectCopies } from '../components/projects/copies'
import { useToast } from '../components/toast'
import { Spinner } from '../components/ui'
import { useCall, useEvent } from '../hooks'
import { useGo } from '../nav'
import { call } from '../rpc'
import type { Project, ProjectList } from '../types/projects'

type Open = { kind: 'edit'; mode: Mode; p?: Project } | { kind: 'copy'; p: Project } | { kind: 'remove'; p: Project }

async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text)
  } catch {
    const area = Object.assign(document.createElement('textarea'), { value: text })
    document.body.append(area)
    area.select()
    document.execCommand('copy')
    area.remove()
  }
}

export function Projects() {
  const { data, error, loading, reload, setData } = useCall<ProjectList>('projects.list')
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState<Open | null>(null)
  const toast = useToast()
  const go = useGo()

  useEvent('projects', () => reload())  // your other devices changed them (shared on the cluster)
  useEvent<{ id: string; connected: boolean }>('session', (s) => setData((d) => d && {
    ...d, clusters: d.clusters.map((c) => c.id === s.id ? { ...c, connected: s.connected } : c) }))

  const act: RowActions = {
    // a paper opens at its main .tex in the LaTeX page
    open: (p) => go('latex', { cluster: p.cluster, path: p.main_tex ? `${p.path.replace(/\/$/, '')}/${p.main_tex}` : p.path }),
    copy: (p) => data && data.clusters.length < 2 ? toast('Add another cluster first') : setOpen({ kind: 'copy', p }),
    edit: (p) => setOpen({ kind: 'edit', mode: 'edit', p }),
    copyPath: (p) => copyText(p.path).then(() => toast('Path copied')),
    remove: (p) => setOpen({ kind: 'remove', p }),
  }

  const remove = (p: Project) => {
    setOpen(null)
    call('projects.remove', { id: p.id }).then(reload).catch((e: Error) => toast(e.message))
  }

  if (error) return <p className="p-8 text-bad">Could not load projects: {error}</p>
  if (!data) return loading ? <div className="grid h-full place-items-center"><Spinner size={24} /></div> : null

  const words = query.toLowerCase().split(/\s+/).filter(Boolean)
  const shown = data.projects.filter((p) => {
    const hay = `${p.name} ${p.path} ${p.cluster_name || p.cluster}`.toLowerCase()
    return words.every((w) => hay.includes(w))
  })
  const add = () => setOpen({ kind: 'edit', mode: 'add' })
  const create = () => setOpen({ kind: 'edit', mode: 'new' })

  return (
    <>
      {data.projects.length === 0 ? (
        <div className="grid h-full place-items-center">
          <EmptyState icon={Folder} title="No projects yet"
            text="Add a folder you already have on a cluster, or make a new one. Then open it in Code, VS Code, an
              agent or Files with one click."
            action={<>
              <EButton icon={FolderOpen} onClick={add}>Add a folder you have</EButton>
              <EButton kind="primary" icon={Plus} onClick={create}>New project</EButton>
            </>} />
        </div>
      ) : (
        <EPage width={860} note={data.projects.length > 6 && <SearchField value={query} onChange={setQuery}
          placeholder="Search projects" />} actions={<>
          <EButton icon={FolderOpen} onClick={add} title="Use a folder that is already on a cluster">
            Add folder</EButton>
          <EButton kind="primary" icon={Plus} onClick={create}>New project</EButton>
        </>}>
          {shown.length
            ? <List>{shown.map((p) =>
                <ProjectRow key={p.id} p={p} experimental={data.experimental} act={act} />)}</List>
            : <p className="py-10 text-center text-dim">Nothing matches “{query}”</p>}
          <Transfers />
        </EPage>
      )}

      {open?.kind === 'edit' && (
        <ProjectDialog mode={open.mode} project={open.p} clusters={data.clusters} projects={data.projects}
          onClose={() => setOpen(null)}
          onSaved={(p, created) => { setOpen(null); toast(`${created ? 'Created' : 'Saved'} ${p.name}`); reload() }} />
      )}
      {open?.kind === 'copy' && (
        <CopyDialog p={open.p} onClose={() => setOpen(null)}
          onStarted={(ids, text) => { expectCopies(ids, text); toast(text); reload() }} />
      )}
      {open?.kind === 'remove' && (
        <Confirm title={`Remove ${open.p.name}?`} keep="Keep it" act="Remove" onClose={() => setOpen(null)}
          onAct={() => remove(open.p)}>
          <p>Only from this list. The folder on the cluster stays.</p>
        </Confirm>
      )}
    </>
  )
}
