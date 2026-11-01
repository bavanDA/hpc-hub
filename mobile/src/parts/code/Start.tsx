// What the Code tab shows with no file open: edits from earlier that weren't saved, the files you opened lately,
// your projects (each opens the file browser there), and Browse.
import { Clock, FileWarning, FolderGit2, FolderOpen } from 'lucide-react'
import { useEffect, useState } from 'react'

import { allDrafts, type Draft } from '@shared/components/code/drafts'
import { useClusters } from '@shared/components/clusters/store'
import { EmptyState } from '@shared/components/ui'
import { useGo } from '@shared/nav'
import { call } from '@shared/rpc'
import type { Project, ProjectList } from '@shared/types/projects'
import { Button, ListRow } from '../../ui'
import { useConnected } from '../useConnected'
import { folderOf, nameOf, recentFiles } from './util'

type Props = { onOpen: (cluster: string, path: string) => void; onBrowse: (cluster?: string, path?: string) => void }

export function Start({ onOpen, onBrowse }: Props) {
  const go = useGo()
  const { clusters } = useClusters()
  const { live } = useConnected()
  const [drafts, setDrafts] = useState<Draft[]>([])
  const [projects, setProjects] = useState<Project[]>([])
  const recent = recentFiles()
  const name = (id: string) => clusters?.find((c) => c.id === id)?.name ?? id
  const isLive = (id: string) => live.some((c) => c.id === id)

  useEffect(() => {
    allDrafts().then(setDrafts).catch(() => {})
    call<ProjectList>('projects.list').then((l) => setProjects(l.projects.filter((p) => p.cluster_name)))
      .catch(() => setProjects([]))
  }, [])

  if (!live.length && !drafts.length && !recent.length) {
    return <EmptyState icon={FolderOpen} title="No cluster connected"
      text="Connect one to open and edit its files here." action={<Button kind="primary" onClick={() => go('clusters')}>
        Go to Clusters</Button>} />
  }

  const section = 'mt-5 mb-1 text-sm font-semibold text-dim'
  return (
    <div className="h-full overflow-y-auto px-4 pb-6">
      <p className="pt-2 text-dim">Open a file on your cluster to read or change it, and ask an agent about it.</p>
      <Button kind="primary" icon={FolderOpen} className="mt-4 w-full" disabled={!live.length}
        onClick={() => onBrowse()}>Browse files</Button>

      {drafts.length > 0 && <>
        <p className={section}>Edits you haven't saved</p>
        {drafts.map((d) => (
          <ListRow key={`${d.cluster}:${d.path}`} icon={FileWarning} title={nameOf(d.path)}
            subtitle={`${name(d.cluster)} · ${new Date(d.at).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })}`}
            onClick={() => onOpen(d.cluster, d.path)} />
        ))}
      </>}

      {recent.length > 0 && <>
        <p className={section}>Recent</p>
        {recent.map((r) => (
          <ListRow key={`${r.cluster}:${r.path}`} icon={Clock} title={nameOf(r.path)}
            subtitle={`${name(r.cluster)} · ${folderOf(r.path)}`}
            onClick={() => isLive(r.cluster) ? onOpen(r.cluster, r.path) : go('clusters')} />
        ))}
      </>}

      {projects.length > 0 && <>
        <p className={section}>Projects</p>
        {projects.map((p) => (
          <ListRow key={p.id} icon={FolderGit2} title={p.name} subtitle={`${p.cluster_name} · ${p.path}`}
            onClick={() => isLive(p.cluster) ? onBrowse(p.cluster, p.path) : go('clusters')} />
        ))}
      </>}
    </div>
  )
}
