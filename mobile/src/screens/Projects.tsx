// Projects: your named folders on the clusters, the desktop's toolbar and table stacked for a phone. Open offers Code,
// Files, an agent or VS Code; the running terminals come from the desktop's live.ts.
import { FolderOpen, ChevronDown, ChevronUp, Plus } from 'lucide-react'
import { useEffect, useState } from 'react'

import { shortName } from '@shared/components/clusters/loginCopy'
import { expectCopies } from '@shared/components/projects/copies'
import { ALL, YOURS, filterProjects } from '@shared/components/projects/filter'
import type { Sort, SortKey } from '@shared/components/projects/format'
import { useLive } from '@shared/components/projects/live'
import { NoProjects } from '@shared/components/projects/NoProjects'
import { copyText } from '@shared/components/terminals/xterm'
import { setNotify } from '@shared/components/tools/run'
import { Spinner } from '@shared/components/ui/Spinner'
import { useCall, useEvent } from '@shared/hooks'
import { call } from '@shared/rpc'
import type { Project, ProjectList } from '@shared/types/projects'
import { Header } from '../parts/Header'
import { Copies } from '../parts/projects/Copies'
import { CopySheet } from '../parts/projects/CopySheet'
import { OpenProject } from '../parts/projects/ProjectActions'
import { ProjectRow, type RowActions } from '../parts/projects/ProjectRow'
import { ProjectSheet, type Mode } from '../parts/projects/ProjectSheet'
import { Button, ConfirmDialog, PickDialog, SearchField, Segments, SelectButton, useToast } from '../ui'

type Open = { kind: 'open' | 'copy' | 'remove'; p: Project } | { kind: 'edit'; mode: Mode; p?: Project } | { kind: 'group' }

export function Projects() {
  const { data, error, loading, reload, setData } = useCall<ProjectList>('projects.list')
  const [query, setQuery] = useState('')
  const [where, setWhere] = useState(ALL)  // a cluster's id
  const [group, setGroup] = useState(ALL)  // a group's name, or YOURS
  const [sort, setSort] = useState<Sort>({ key: 'opened', desc: true })
  const [open, setOpen] = useState<Open | null>(null)
  const toast = useToast()
  const close = () => setOpen(null)
  useEffect(() => setNotify(toast), [toast])  // "Connecting to Wulver…" while a project waits for its cluster

  useEvent('projects', () => reload())  // your other devices changed them (shared on the cluster)
  useEvent<{ id: string; connected: boolean }>('session', (s) => setData((d) => d && {
    ...d, clusters: d.clusters.map((c) => c.id === s.id ? { ...c, connected: s.connected } : c) }))

  const live = useLive(data?.clusters ?? [], data?.projects ?? [])  // terminals running in it

  const act: RowActions = {
    show: (p) => setOpen({ kind: 'open', p }),
    copy: (p) => setOpen({ kind: 'copy', p }),
    edit: (p) => setOpen({ kind: 'edit', mode: 'edit', p }),
    copyPath: (p) => void copyText(p.path).then((ok) => toast(ok ? 'Path copied' : "Couldn't copy")),
    remove: (p) => setOpen({ kind: 'remove', p }),
  }
  const remove = (p: Project) => call('projects.remove', { id: p.id }).then(reload).catch((e: Error) => toast(e.message))

  const add = () => setOpen({ kind: 'edit', mode: 'add' })
  const create = () => setOpen({ kind: 'edit', mode: 'new' })

  if (error) return <div className="flex h-full flex-col"><Header title="Projects" />
    <p className="p-5 select-text text-bad">Could not load projects: {error}</p></div>
  if (!data) return <div className="flex h-full flex-col"><Header title="Projects" />
    {loading && <div className="grid flex-1 place-items-center"><Spinner size={24} /></div>}</div>

  const { places, at, groups, inGroup, shown } = filterProjects(data, { query, where, group, sort })
  const head = (key: SortKey, title: string, className: string) => (
    <button key={key} onClick={() => setSort({ key, desc: sort.key === key ? !sort.desc : key === 'opened' })}
      className={`flex h-full items-center gap-1 ${sort.key === key ? 'text-text' : ''} ${className}`}>
      {title}{sort.key === key && (sort.desc ? <ChevronDown size={14} /> : <ChevronUp size={14} />)}
    </button>
  )

  return (
    <div className="flex h-full flex-col">
      <Header title="Projects" />
      <div className="@container min-h-0 flex-1 overflow-y-auto pb-6">
        {data.projects.length === 0 ? <div className="grid h-full place-items-center px-5">
          <NoProjects onAdd={add} onCreate={create} /></div> : (
          <>
            <div className="flex flex-col gap-2.5 px-4 pt-4 pb-3">
              {places.length > 1 && <div className="overflow-x-auto [scrollbar-width:none]"><Segments fit label="Cluster" value={at}
                onChange={setWhere} options={[[ALL, 'All'], ...places.map((c) => [c.id, shortName(c)] as const)]} /></div>}
              <div className="flex items-center gap-2">
                {groups.length > 1 && <SelectButton className="min-w-0 shrink-0"
                  label={inGroup === ALL ? 'Group: All' : inGroup === YOURS ? 'Yours' : inGroup}
                  onPress={() => setOpen({ kind: 'group' })} />}
                <div className="min-w-0 flex-1"><SearchField value={query} onChange={setQuery} placeholder="Search projects" /></div>
              </div>
              <div className="flex gap-2">
                <Button icon={FolderOpen} className="flex-1" onClick={add}>Add folder</Button>
                <Button kind="primary" icon={Plus} className="flex-1" onClick={create}>New project</Button>
              </div>
            </div>
            <div className="flex h-8 items-center justify-between border-y border-line px-4 text-xs font-semibold text-dim">
              {head('name', 'Name and folder', '')}
              {head('opened', 'Last opened', '')}
            </div>
            {shown.length
              ? shown.map((p) => <ProjectRow key={p.id} p={p} live={live} act={act} />)
              : <p className="py-10 text-center text-dim">Nothing matches “{query}”</p>}
            <Copies />
          </>
        )}
      </div>

      {open?.kind === 'group' && (
        <PickDialog title="Group" value={inGroup} onClose={close} onPick={setGroup}
          options={[{ value: ALL, label: 'Group: All' }, ...groups.map((g) => ({ value: g, label: g === YOURS ? 'Yours' : g }))]} />
      )}
      {open?.kind === 'open' && (
        <OpenProject p={open.p} experimental={data.experimental} failed={toast} onClose={close} />
      )}
      {open?.kind === 'edit' && (
        <ProjectSheet mode={open.mode} project={open.p} clusters={data.clusters} projects={data.projects}
          onClose={close} onSaved={(p, created) => { close(); toast(`${created ? 'Created' : 'Saved'} ${p.name}`); reload() }} />
      )}
      {open?.kind === 'copy' && (
        <CopySheet p={open.p} onClose={close}
          onStarted={(ids, text) => { expectCopies(ids, text); toast(text); reload() }} />
      )}
      {open?.kind === 'remove' && (
        <ConfirmDialog title={`Remove ${open.p.name}?`} text="Only from this list. The folder on the cluster stays."
          keep="Keep it" confirm="Remove" danger onConfirm={() => remove(open.p)} onClose={close} />
      )}
    </div>
  )
}
