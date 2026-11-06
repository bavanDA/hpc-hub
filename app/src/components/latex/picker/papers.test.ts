import { describe, expect, it } from 'vitest'

import type { LatexProject, Paper } from '../../../types/latex'
import { matchPapers, matchProjects, mergeFound, openPath } from './papers'

const paper = (cluster: string, folder: string, mtime: number, title = 'A paper') =>
  ({ cluster, folder, mtime, title }) as Paper

describe('openPath', () => {
  it('opens the main file when known', () => {
    expect(openPath({ path: '/home/jdoe/p', main_tex: 'main.tex' })).toBe('/home/jdoe/p/main.tex')
    expect(openPath({ path: '/home/jdoe/p', main_tex: '' })).toBe('/home/jdoe/p')
  })
})

describe('filters', () => {
  it('match name or path, ignoring case and spaces around', () => {
    const projects = [{ name: 'Thesis', path: '/home/jdoe/thesis' }, { name: 'Other', path: '/x/myproject' }] as LatexProject[]
    expect(matchProjects(projects, '  THES ').map((p) => p.name)).toEqual(['Thesis'])
    expect(matchProjects(projects, 'myproject').map((p) => p.name)).toEqual(['Other'])
    expect(matchProjects(projects, '')).toHaveLength(2)
  })
  it('match a found paper by title or folder', () => {
    const papers = [paper('a', '/home/jdoe/x', 1, 'Sparse downscaling'), paper('a', '/home/jdoe/y', 2, 'Notes')]
    expect(matchPapers(papers, 'sparse').map((p) => p.folder)).toEqual(['/home/jdoe/x'])
    expect(matchPapers(papers, '/y').map((p) => p.title)).toEqual(['Notes'])
  })
})

describe('mergeFound', () => {
  it('replaces the papers of searched clusters and sorts newest first', () => {
    const old = [paper('a', '/old-a', 5), paper('b', '/old-b', 1)]
    const merged = mergeFound(old, [['a', [paper('a', '/new-a', 3), paper('a', '/new-a2', 9)]]])
    expect(merged.map((p) => p.folder)).toEqual(['/new-a2', '/new-a', '/old-b'])
  })
})
