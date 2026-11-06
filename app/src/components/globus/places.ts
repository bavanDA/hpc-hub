import { useEffect, useState } from 'react'

import { call } from '../../rpc'
import type { Place, Places, ProjectList } from '../../types/projects'

const globusPath = (path: string) =>
  path === '~' || path === '~/' ? '' : path.startsWith('~/') ? `/~/${path.slice(2)}` : path

export function usePlaces(cluster: string) {
  const [storage, setStorage] = useState<Place[]>([])
  const [projects, setProjects] = useState<Place[]>([])
  useEffect(() => {
    if (!cluster) return
    setStorage([])
    setProjects([])
    call<Places>('projects.places', { cluster })
      .then((p) => setStorage(p.storage.filter((x) => x.label !== 'Home'))).catch(() => {})
    call<ProjectList>('projects.list')
      .then((l) => setProjects(l.projects.filter((p) => p.cluster === cluster)
        .map((p) => ({ label: p.name, path: p.path }))))
      .catch(() => {})
  }, [cluster])
  const fix = (xs: Place[]) => xs.map((x) => ({ ...x, path: globusPath(x.path) }))
  return { places: [{ label: 'Home', path: '' }, ...fix(storage)], projects: fix(projects) }
}
