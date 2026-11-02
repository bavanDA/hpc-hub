// The folder open on the Code page, per cluster, like VS Code's open folder: kept across restarts, with the folders
// opened before it. '' is no folder open (the start view).
import { useEffect, useState } from 'react'

import { call } from '../../../rpc'
import type { Places, Project, ProjectList } from '../../../types/projects'

const OPEN = 'code.folder.'
const RECENT = 'code.recent.'
const KEEP = 8

function read(key: string): string | null {
  try { return localStorage.getItem(key) } catch { return null }
}

function write(key: string, value: string) {
  try { localStorage.setItem(key, value) } catch { /* private window */ }
}

/** The folder open last time on this cluster, '' for none. */
export const openFolder = (cluster: string) => read(OPEN + cluster) ?? ''

export function recentFolders(cluster: string): string[] {
  try { return JSON.parse(read(RECENT + cluster) ?? '[]') as string[] } catch { return [] }
}

/** Remember path as open on cluster ('' closes it); an opened folder goes to the top of the recent ones. */
export function rememberFolder(cluster: string, path: string) {
  write(OPEN + cluster, path)
  if (path) write(RECENT + cluster, JSON.stringify([path, ...recentFolders(cluster).filter((p) => p !== path)]
    .slice(0, KEEP)))
}

/** path is folder or a file or folder in it. */
export const inside = (path: string, folder: string) =>
  !!folder && (path === folder || path.startsWith(folder.replace(/\/+$/, '') + '/'))

/** /home/jdoe/x as ~/x. */
export const tilde = (path: string, home: string) => (home && inside(path, home) ? '~' + path.slice(home.length) : path)

export const folderName = (path: string, home: string, projects: Project[]) =>
  projects.find((p) => p.path === path)?.name ?? (path === home ? 'Home' : path.split('/').filter(Boolean).pop() ?? '/')

/** What the start view and the switcher offer: this cluster's projects, its home, the folders opened before. */
export function usePlaces(cluster: string) {
  const [projects, setProjects] = useState<Project[]>([])
  const [home, setHome] = useState('')
  useEffect(() => {
    if (!cluster) return
    call<ProjectList>('projects.list').then((l) => setProjects(l.projects.filter((p) => p.cluster === cluster)))
      .catch(() => setProjects([]))
    call<Places>('projects.places', { cluster }).then((p) => setHome(p.home)).catch(() => setHome(''))
  }, [cluster])
  // read on every draw, so a folder just opened is there
  const recent = recentFolders(cluster).filter((p) => p !== home && !projects.some((x) => x.path === p))
  return { projects, home, recent }
}
