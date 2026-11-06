import { describe, expect, it } from 'vitest'

import { buildTree, canMove, folderOf, foldersAbove, targetFolder } from './tree'

describe('buildTree', () => {
  it('nests entries, folders first, names without case', () => {
    const tree = buildTree([
      { path: 'main.tex', kind: 'f' },
      { path: 'sections/results.tex', kind: 'f' },
      { path: 'Refs.bib', kind: 'f' },
      { path: 'sections', kind: 'd' },
      { path: 'figures', kind: 'd' },
    ] as never)
    expect(tree.map((n) => n.name)).toEqual(['figures', 'sections', 'main.tex', 'Refs.bib'])
    expect(tree[1].children.map((n) => n.path)).toEqual(['sections/results.tex'])
    expect(tree[0].dir).toBe(true)
  })
})

describe('folders', () => {
  it('folderOf gives "" at the top', () => {
    expect(folderOf('main.tex')).toBe('')
    expect(folderOf('a/b/c.tex')).toBe('a/b')
  })
  it('targetFolder is the folder itself or the file\'s folder', () => {
    expect(targetFolder('a/b', true)).toBe('a/b')
    expect(targetFolder('a/b.tex', false)).toBe('a')
  })
  it('foldersAbove lists outermost first', () => {
    expect(foldersAbove('a/b/c.tex')).toEqual(['a', 'a/b'])
    expect(foldersAbove('main.tex')).toEqual([])
  })
})

describe('canMove', () => {
  it('refuses moves that change nothing or go into itself', () => {
    expect(canMove('', 'a')).toBe(false)
    expect(canMove('a', 'a')).toBe(false)
    expect(canMove('a', 'a/b')).toBe(false)
    expect(canMove('a/x.tex', 'a')).toBe(false)
    expect(canMove('x.tex', '')).toBe(false)
  })
  it('allows a real move', () => {
    expect(canMove('a/x.tex', '')).toBe(true)
    expect(canMove('x.tex', 'a')).toBe(true)
    expect(canMove('ab', 'a')).toBe(true)
  })
})
