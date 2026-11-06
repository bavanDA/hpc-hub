import { describe, expect, it } from 'vitest'

import type { Project, ProjectCluster } from '../../types/projects'
import { ALL, filterProjects, YOURS } from './filter'

const project = (over: Partial<Project>): Project => ({ id: '', name: 'p', cluster: 'alder', cluster_name: 'Alder',
  path: '/home/p', group: '', main_tex: '', kind: '', latex: false, opened: 0, copy_to: '', copy_into: '', ...over })
const clusters: ProjectCluster[] = [
  { id: 'alder', name: 'Alder', connected: true },
  { id: 'birch', name: 'Birch', connected: false },
  { id: 'empty', name: 'Empty', connected: true },
]
const projects = [
  project({ name: 'Alpha', cluster: 'alder', group: 'lab', opened: 3 }),
  project({ name: 'Beta', cluster: 'birch', cluster_name: 'Birch', opened: 2 }),
  project({ name: 'Gamma', cluster: 'alder', path: '/scratch/team/gamma', group: 'team', opened: 1 }),
]
const base = { query: '', where: ALL, group: ALL, sort: { key: 'opened' as const, desc: true } }

describe('filterProjects', () => {
  it('lists only clusters that hold a project', () => {
    expect(filterProjects({ clusters, projects }, base).places.map((c) => c.id)).toEqual(['alder', 'birch'])
  })

  it('sorts groups by name with your own last', () => {
    expect(filterProjects({ clusters, projects }, base).groups).toEqual(['lab', 'team', YOURS])
  })

  it('shows everything sorted when nothing is picked', () => {
    expect(filterProjects({ clusters, projects }, base).shown.map((p) => p.name)).toEqual(['Alpha', 'Beta', 'Gamma'])
  })

  it('keeps projects on the picked cluster', () => {
    const r = filterProjects({ clusters, projects }, { ...base, where: 'birch' })
    expect(r.at).toBe('birch')
    expect(r.shown.map((p) => p.name)).toEqual(['Beta'])
  })

  it('falls back to all when the picked cluster has no projects left', () => {
    expect(filterProjects({ clusters, projects }, { ...base, where: 'empty' }).at).toBe(ALL)
  })

  it('ignores the cluster pick when only one cluster has projects', () => {
    const one = projects.filter((p) => p.cluster === 'alder')
    expect(filterProjects({ clusters, projects: one }, { ...base, where: 'alder' }).at).toBe(ALL)
  })

  it('keeps projects in the picked group, your own included', () => {
    expect(filterProjects({ clusters, projects }, { ...base, group: 'team' }).shown.map((p) => p.name))
      .toEqual(['Gamma'])
    expect(filterProjects({ clusters, projects }, { ...base, group: YOURS }).shown.map((p) => p.name))
      .toEqual(['Beta'])
  })

  it('falls back to all groups when the picked one is gone', () => {
    expect(filterProjects({ clusters, projects }, { ...base, group: 'old' }).inGroup).toBe(ALL)
  })

  it('needs every typed word somewhere in name, path, cluster or group', () => {
    const find = (query: string) => filterProjects({ clusters, projects }, { ...base, query }).shown.map((p) => p.name)
    expect(find('  SCRATCH  gamma ')).toEqual(['Gamma'])
    expect(find('birch')).toEqual(['Beta'])
    expect(find('lab alpha')).toEqual(['Alpha'])
    expect(find('alpha beta')).toEqual([])
  })
})
