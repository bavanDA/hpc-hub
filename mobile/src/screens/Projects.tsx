// More › Projects: your named folders on the clusters. Tap one to open it in Code, Files, an agent or VS Code in the
// browser, or to copy it to another cluster. + adds a folder you have or creates a new project.
import { FileText, Folder, Plus } from 'lucide-react'
import { useEffect, useState } from 'react'

import { expectCopies } from '@shared/components/projects/copies'
import { copyText } from '@shared/components/terminals/xterm'
import { setNotify } from '@shared/components/tools/run'
import { Spinner } from '@shared/components/ui'
import { useCall, useEvent } from '@shared/hooks'
import { call } from '@shared/rpc'
import type { Project, ProjectList } from '@shared/types/projects'
import { shortCluster, wrapPath } from '../parts/code/util'
import { Header } from '../parts/Header'
import { CopySheet } from '../parts/projects/CopySheet'
import { Copies } from '../parts/projects/Copies'
import { ProjectActions, type Act } from '../parts/projects/ProjectActions'
import { ProjectSheet, type Mode } from '../parts/projects/ProjectSheet'
import { ActionSheet, Button, ConfirmSheet, EmptyState, List, MainButton, Row, SearchField, useToast } from '../ui'

type Open = { kind: 'actions' | 'copy' | 'remove'; p: Project } | { kind: 'edit'; mode: Mode; p?: Project }
  | { kind: 'add' }

export function Projects() {
  const { data, error, loading, reload, setData } = useCall<ProjectList>('projects.list')
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState<Open | null>(null)
  const toast = useToast()
  const close = () => setOpen(null)
  useEffect(() => setNotify(toast), [toast])  // "Connecting to Wulver…" while a project waits for its cluster

  useEvent('projects', () => reload())  // your other devices changed them (shared on the cluster)
  useEvent<{ id: string; connected: boolean }>('session', (s) => setData((d) => d && {
    ...d, clusters: d.clusters.map((c) => c.id === s.id ? { ...c, connected: s.connected } : c) }))

  const act: Act = {
    copy: (p) => data && data.clusters.length < 2 ? toast('Add another cluster first') : setOpen({ kind: 'copy', p }),
    edit: (p) => setOpen({ kind: 'edit', mode: 'edit', p }),
    copyPath: (p) => copyText(p.path).then((ok) => toast(ok ? 'Path copied' : "Couldn't copy")),
    remove: (p) => setOpen({ kind: 'remove', p }),
    failed: toast,
  }
  const remove = (p: Project) => call('projects.remove', { id: p.id }).then(reload).catch((e: Error) => toast(e.message))

  const many = new Set((data?.projects ?? []).map((p) => p.cluster)).size > 1
  const words = query.toLowerCase().split(/\s+/).filter(Boolean)
  const shown = (data?.projects ?? []).filter((p) => {
    const hay = `${p.name} ${p.path} ${p.cluster_name || p.cluster}`.toLowerCase()
    return words.every((w) => hay.includes(w))
  })

  return (
    <div className="flex h-full flex-col">
      <Header title="Projects">
        {data && data.projects.length > 0 && (
          <button aria-label="Add a project" onClick={() => setOpen({ kind: 'add' })}
            className="grid size-12 place-items-center rounded-full active:bg-pressed"><Plus size={24} /></button>
        )}
      </Header>
      <div className="min-h-0 flex-1 overflow-y-auto pb-6">
        {error && <p className="px-4 py-3 select-text text-bad">Couldn't load projects: {error}</p>}
        {!data && !error && loading && <div className="grid h-40 place-items-center"><Spinner size={28} /></div>}
        {data && data.projects.length === 0 && (
          <EmptyState icon={Folder} title="No projects yet"
            text="Open a project in Code, Files or an agent with one tap."
            action={<div className="mt-2 flex w-64 flex-col gap-3">
              <MainButton onClick={() => setOpen({ kind: 'edit', mode: 'new' })}>New project</MainButton>
              <Button onClick={() => setOpen({ kind: 'edit', mode: 'add' })}>Add a folder you have</Button>
            </div>} />
        )}
        {data && data.projects.length > 0 && (
          <>
            {data.projects.length > 6 && (
              <div className="px-4 pb-3"><SearchField value={query} onChange={setQuery} placeholder="Search projects" /></div>
            )}
            {shown.length ? (
              <List>
                {shown.map((p) => (
                  <Row key={p.id} icon={p.main_tex ? FileText : Folder} label={p.name}
                    sub={wrapPath(many ? `${p.cluster_name ? shortCluster(p.cluster_name) : `${p.cluster}, not set up`} · ${p.path}`
                      : p.path)}
                    onPress={() => setOpen({ kind: 'actions', p })} />
                ))}
              </List>
            ) : <p className="py-10 text-center text-dim">Nothing matches “{query}”</p>}
          </>
        )}
        <Copies />
      </div>

      {open?.kind === 'add' && (
        <ActionSheet onClose={close} actions={[
          { label: 'New project', icon: Plus, onPick: () => setOpen({ kind: 'edit', mode: 'new' }) },
          { label: 'Add a folder you have', icon: Folder, onPick: () => setOpen({ kind: 'edit', mode: 'add' }) },
        ]} />
      )}
      {open?.kind === 'actions' && data && (
        <ProjectActions p={open.p} experimental={data.experimental} act={act} onClose={close} />
      )}
      {open?.kind === 'edit' && data && (
        <ProjectSheet mode={open.mode} project={open.p} clusters={data.clusters} projects={data.projects}
          onClose={close} onSaved={(p, created) => { close(); toast(`${created ? 'Created' : 'Saved'} ${p.name}`); reload() }} />
      )}
      {open?.kind === 'copy' && (
        <CopySheet p={open.p} onClose={close}
          onStarted={(ids, text) => { expectCopies(ids, text); toast(text); reload() }} />
      )}
      {open?.kind === 'remove' && (
        <ConfirmSheet title={`Remove ${open.p.name}?`} text="Only from this list. The folder on the cluster stays."
          keep="Keep it" confirm="Remove" danger onConfirm={() => remove(open.p)} onClose={close} />
      )}
    </div>
  )
}
