// Projects: your named folders on the clusters. Open one in VS Code, an agent, Files or LaTeX; copy it elsewhere.
import { Folder, FolderOpen, Plus, Search } from 'lucide-react'
import { useState } from 'react'

import { CopyDialog } from '../components/projects/CopyDialog'
import { ProjectDialog, type Mode } from '../components/projects/ProjectDialog'
import { ProjectRow, type RowActions } from '../components/projects/ProjectRow'
import { Transfers } from '../components/projects/Transfers'
import { expectCopies } from '../components/projects/copies'
import { useToast } from '../components/toast'
import { AlertDialog, Button, EmptyState, List, Spinner } from '../components/ui'
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
        <EmptyState icon={Folder} title="No projects yet"
          text="Add a folder you already have on a cluster (myproj, thesis, a paper…) or create a new one. Then open it
            in VS Code, Claude, Files or LaTeX."
          action={<div className="mt-2 flex gap-2">
            <Button onClick={add}>Add folder</Button>
            <Button kind="primary" onClick={create}>New project</Button>
          </div>} />
      ) : (
        <div className="mx-auto flex max-w-[900px] flex-col gap-3 px-4 pt-[18px] pb-6">
          <div className="flex items-center gap-2 pb-1">
            <h1 className="flex-1 text-2xl font-extrabold">Projects</h1>
            <Button onClick={add} title="Use a folder that is already on a cluster">
              <FolderOpen size={16} /> Add folder</Button>
            <Button kind="suggested" onClick={create}><Plus size={16} /> New project</Button>
          </div>
          <label className="flex h-9 items-center gap-2 rounded-lg bg-pill px-3 focus-within:ring-2
            focus-within:ring-accent">
            <Search size={16} className="shrink-0 text-dim" />
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search projects"
              className="min-w-0 flex-1 bg-transparent outline-none placeholder:text-dim" />
          </label>
          {shown.length
            ? <List>{shown.map((p) =>
                <ProjectRow key={p.id} p={p} experimental={data.experimental} act={act} />)}</List>
            : <p className="py-10 text-center text-dim">No projects match “{query}”</p>}
          <div className="mt-3"><Transfers /></div>
        </div>
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
        <AlertDialog title={`Remove ${open.p.name}?`} keep="Keep it" act="Remove" onClose={() => setOpen(null)}
          onAct={() => remove(open.p)}>
          <p>Only from this list. The folder on the cluster stays.</p>
        </AlertDialog>
      )}
    </>
  )
}
