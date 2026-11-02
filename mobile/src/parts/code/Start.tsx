// What the Code tab shows with no file open: edits from earlier that weren't saved, the files you opened lately,
// your projects (each opens the file browser there), and Browse.
import { Clock, FileWarning, FolderGit2, FolderOpen } from 'lucide-react'
import { useEffect, useState } from 'react'

import { allDrafts, type Draft } from '@shared/components/code/drafts'
import { useClusters } from '@shared/components/clusters/store'
import { useGo } from '@shared/nav'
import { call } from '@shared/rpc'
import type { Project, ProjectList } from '@shared/types/projects'
import { EmptyState, MainButton, Row, Section } from '../../ui'
import { useConnected } from '../useConnected'
import { folderOf, nameOf, recentFiles, shortCluster, wrapPath } from './util'

type Props = { onOpen: (cluster: string, path: string) => void; onBrowse: (cluster?: string, path?: string) => void }

export function Start({ onOpen, onBrowse }: Props) {
  const go = useGo()
  const { clusters } = useClusters()
  const { live } = useConnected()
  const [drafts, setDrafts] = useState<Draft[]>([])
  const [projects, setProjects] = useState<Project[]>([])
  const recent = recentFiles()
  const name = (id: string) => shortCluster(clusters?.find((c) => c.id === id)?.name ?? id)
  const many = new Set([...drafts, ...recent, ...projects].map((x) => x.cluster)).size > 1
  const where = (cluster: string, path: string) => wrapPath(many ? `${name(cluster)} · ${path}` : path)
  const isLive = (id: string) => live.some((c) => c.id === id)

  useEffect(() => {
    allDrafts().then(setDrafts).catch(() => {})
    call<ProjectList>('projects.list').then((l) => setProjects(l.projects.filter((p) => p.cluster_name)))
      .catch(() => setProjects([]))
  }, [])

  if (!live.length && !drafts.length && !recent.length) {
    return <EmptyState icon={FolderOpen} title="No cluster connected"
      text="Connect one to open its files here." action={<MainButton onClick={() => go('clusters')}>
        Go to Clusters</MainButton>} />
  }

  const when = (at: number) => new Date(at).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })
  return (
    <div className="h-full overflow-y-auto pb-6">
      <div className="px-4 pt-2">
        <MainButton icon={FolderOpen} disabled={!live.length} onClick={() => onBrowse()}>Browse files</MainButton>
      </div>

      {drafts.length > 0 && (
        <Section title="Not saved">
          {drafts.map((d) => (
            <Row key={`${d.cluster}:${d.path}`} icon={FileWarning} label={nameOf(d.path)}
              sub={many ? `${name(d.cluster)} · ${when(d.at)}` : when(d.at)} onPress={() => onOpen(d.cluster, d.path)} />
          ))}
        </Section>
      )}

      {recent.length > 0 && (
        <Section title="Recent">
          {recent.map((r) => (
            <Row key={`${r.cluster}:${r.path}`} icon={Clock} label={nameOf(r.path)} sub={where(r.cluster, folderOf(r.path))}
              onPress={() => isLive(r.cluster) ? onOpen(r.cluster, r.path) : go('clusters')} />
          ))}
        </Section>
      )}

      {projects.length > 0 && (
        <Section title="Projects">
          {projects.map((p) => (
            <Row key={p.id} icon={FolderGit2} label={p.name} sub={where(p.cluster, p.path)}
              onPress={() => isLive(p.cluster) ? onBrowse(p.cluster, p.path) : go('clusters')} />
          ))}
        </Section>
      )}
    </div>
  )
}
