// Projects: your named folders on the clusters, as a table like Jobs. Open one in Code, Files, a terminal, VS Code,
// an agent or LaTeX; copy it elsewhere.
import { FileText, Folder, FolderOpen, Plus } from 'lucide-react'
import { useState } from 'react'

import { shortName } from '../components/clusters/loginCopy'
import { Confirm, EButton, EmptyState, SearchField } from '../components/e/extra'
import { Segments } from '../components/e/ui'
import { Select } from '../components/jobs/Select'
import { CopyDialog } from '../components/projects/CopyDialog'
import { useLive } from '../components/projects/live'
import { ProjectDialog, type Mode } from '../components/projects/ProjectDialog'
import { sortProjects, type Sort } from '../components/projects/format'
import { ProjectTable, type RowActions } from '../components/projects/ProjectTable'
import { Transfers } from '../components/projects/Transfers'
import { expectCopies } from '../components/projects/copies'
import { OpenDialog } from '../components/tools/OpenDialog'
import { useToast } from '../components/toast'
import { Spinner } from '../components/ui'
import { useCall, useEvent } from '../hooks'
import { useGo } from '../nav'
import { call } from '../rpc'
import type { Project, ProjectList } from '../types/projects'

type Open = { kind: 'edit'; mode: Mode; p?: Project } | { kind: 'copy' | 'remove' | 'open'; p: Project }
const ALL = '*'
const YOURS = ''  // projects in your own folders, no group's

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
  const places = data.clusters.filter((c) => data.projects.some((p) => p.cluster === c.id))
  const at = places.length > 1 && places.some((c) => c.id === where) ? where : ALL  // its last project went
  const groups = [...new Set(data.projects.map((p) => p.group || YOURS))]
    .sort((a, b) => (a === YOURS ? 1 : b === YOURS ? -1 : a.localeCompare(b)))
  const inGroup = groups.length > 1 && groups.includes(group) ? group : ALL  // its last project went
  const shown = sortProjects(data.projects.filter((p) => {
    const hay = `${p.name} ${p.path} ${p.cluster_name || p.cluster} ${p.group}`.toLowerCase()
    return (at === ALL || p.cluster === at) && (inGroup === ALL || (p.group || YOURS) === inGroup)
      && words.every((w) => hay.includes(w))
  }), sort)
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
        <div className="@container h-full overflow-auto scheme-light-dark">
          <div className="px-6 pt-5 pb-10">
            <div className="flex flex-wrap items-center gap-2.5 pb-4">
              {places.length > 1 && <Segments fit label="Cluster" value={at} onChange={setWhere}
                options={[[ALL, 'All'], ...places.map((c) => [c.id, shortName(c)] as const)]} />}
              {groups.length > 1 && <div className="ml-auto"><Select label="Group" value={inGroup} onChange={setGroup}
                options={[[ALL, 'Group: All'], ...groups.map((g) => [g, g === YOURS ? 'Yours' : g] as const)]} /></div>}
              <div className={`${groups.length > 1 ? '' : 'ml-auto '}w-[240px] min-w-[140px] shrink`}>
                <SearchField value={query} onChange={setQuery} placeholder="Search projects" />
              </div>
              <EButton icon={FolderOpen} onClick={add} title="Use a folder that is already on a cluster"
                aria-label="Add folder" className="@max-[860px]:px-3">
                <span className="@max-[860px]:hidden">Add folder</span></EButton>
              <EButton kind="primary" icon={Plus} onClick={create}>New project</EButton>
            </div>
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
