import { useEffect, useState } from 'react'

import { call } from '../../../rpc'
import type { Places, Project, ProjectList } from '../../../types/projects'
import { recentFolders } from './workspace'

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
