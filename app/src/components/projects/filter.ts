import type { ProjectList } from '../../types/projects'
import { sortProjects, type Sort } from './format'

export const ALL = '*'
export const YOURS = ''  // projects in your own folders, no group's

export type Filter = { query: string; where: string; group: string; sort: Sort }

export function filterProjects({ clusters, projects }: Pick<ProjectList, 'clusters' | 'projects'>,
  { query, where, group, sort }: Filter) {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean)
  const places = clusters.filter((c) => projects.some((p) => p.cluster === c.id))
  const at = places.length > 1 && places.some((c) => c.id === where) ? where : ALL  // its last project went
  const groups = [...new Set(projects.map((p) => p.group || YOURS))]
    .sort((a, b) => (a === YOURS ? 1 : b === YOURS ? -1 : a.localeCompare(b)))
  const inGroup = groups.length > 1 && groups.includes(group) ? group : ALL  // its last project went
  const shown = sortProjects(projects.filter((p) => {
    const hay = `${p.name} ${p.path} ${p.cluster_name || p.cluster} ${p.group}`.toLowerCase()
    return (at === ALL || p.cluster === at) && (inGroup === ALL || (p.group || YOURS) === inGroup)
      && words.every((w) => hay.includes(w))
  }), sort)
  return { places, at, groups, inGroup, shown }
}
