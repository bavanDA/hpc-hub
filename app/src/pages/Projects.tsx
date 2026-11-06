import { FileText } from 'lucide-react'
import { useState } from 'react'

import { Confirm } from '../components/e/extra'
import { CopyDialog } from '../components/projects/CopyDialog'
import { copyPath } from '../components/projects/copyPath'
import { useLive } from '../components/projects/live'
import { NoProjects } from '../components/projects/NoProjects'
import { ProjectDialog, type Mode } from '../components/projects/ProjectDialog'
import { ALL, filterProjects } from '../components/projects/filter'
import type { Sort } from '../components/projects/format'
import { ProjectTable, type RowActions } from '../components/projects/ProjectTable'
import { Toolbar } from '../components/projects/Toolbar'
import { Transfers } from '../components/projects/Transfers'
import { expectCopies } from '../components/projects/copies'
import { OpenDialog } from '../components/tools/OpenDialog'
import { useToast } from '../components/useToast'
import { Spinner } from '../components/ui'
import { useCall, useEvent } from '../hooks'
import { useGo } from '../nav'
import { call } from '../rpc'
import type { Project, ProjectList } from '../types/projects'

type Open = { kind: 'edit'; mode: Mode; p?: Project } | { kind: 'copy' | 'remove' | 'open'; p: Project }

export function Projects() {
  const { data, error, loading, reload, setData } = useCall<ProjectList>('projects.list')
  const [query, setQuery] = useState('')
  const [where, setWhere] = useState(ALL)  // a cluster's id
  const [group, setGroup] = useState(ALL)  // a group's name, or YOURS
  const [sort, setSort] = useState<Sort>({ key: 'opened', desc: true })
  const [open, setOpen] = useState<Open | null>(null)
  const toast = useToast()
  const go = useGo()

  useEvent('projects', () => reload())  // your other devices changed them (shared on the cluster)
  useEvent<{ id: string; connected: boolean }>('session', (s) => setData((d) => d && {
    ...d, clusters: d.clusters.map((c) => c.id === s.id ? { ...c, connected: s.connected } : c) }))

  const live = useLive(data?.clusters ?? [], data?.projects ?? [])

  // a paper opens at its main .tex in the LaTeX page
  const latex = (p: Project) =>
    go('latex', { cluster: p.cluster, path: p.main_tex ? `${p.path.replace(/\/$/, '')}/${p.main_tex}` : p.path })
  const act: RowActions = {
    show: (p) => setOpen({ kind: 'open', p }),
    copy: (p) => setOpen({ kind: 'copy', p }),
    edit: (p) => setOpen({ kind: 'edit', mode: 'edit', p }),
    copyPath: (p) => copyPath(p.path).then(() => toast('Path copied')),
    remove: (p) => setOpen({ kind: 'remove', p }),
  }

  const remove = (p: Project) => {
    setOpen(null)
    call('projects.remove', { id: p.id }).then(reload).catch((e: Error) => toast(e.message))
  }

  if (error) return <p className="p-8 text-bad">Could not load projects: {error}</p>
  if (!data) return loading ? <div className="grid h-full place-items-center"><Spinner size={24} /></div> : null

  const { places, at, groups, inGroup, shown } = filterProjects(data, { query, where, group, sort })
  const add = () => setOpen({ kind: 'edit', mode: 'add' })
  const create = () => setOpen({ kind: 'edit', mode: 'new' })

  return (
    <>
      {data.projects.length === 0 ? <NoProjects onAdd={add} onCreate={create} /> : (
        <div className="@container h-full overflow-auto scheme-light-dark">
          <div className="px-6 pt-5 pb-10">
            <Toolbar places={places} at={at} onWhere={setWhere} groups={groups} inGroup={inGroup}
              onGroup={setGroup} query={query} onQuery={setQuery} onAdd={add} onCreate={create} />
            {shown.length
              ? <ProjectTable projects={shown} sort={sort} onSort={setSort} live={live} act={act} />
              : <p className="border-t border-line py-10 text-center text-dim">
                  Nothing matches “{query}”</p>}
            <Transfers />
          </div>
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
      {open?.kind === 'open' && (() => {
        const p = open.p
        // opened also moves the project up the list
        return <OpenDialog name={p.name} cluster={p.cluster} clusterName={p.cluster_name} folder={p.path}
          prepare={() => call<Project>('projects.opened', { id: p.id }).then((x) => x.path, () => p.path)}
          extra={data.experimental ? [{ label: 'LaTeX', icon: FileText, onPick: () => latex(p) }] : []}
          onClose={() => setOpen(null)} />
      })()}
      {open?.kind === 'remove' && (
        <Confirm title={`Remove ${open.p.name}?`} keep="Keep it" act="Remove" onClose={() => setOpen(null)}
          onAct={() => remove(open.p)}>
          <p>Only from this list. The folder on the cluster stays.</p>
        </Confirm>
      )}
    </>
  )
}
