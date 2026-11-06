import { describe, expect, it } from 'vitest'

import type { CopyTarget, CopyTargets, Project } from '../../types/projects'
import { inside, spotFor, startFolder } from './copyInto'

const target = (id: string, over: Partial<CopyTarget> = {}): CopyTarget =>
  ({ id, name: id, connected: true, globus_missing: '', ...over })
const targets = (over: Partial<CopyTargets> = {}): CopyTargets =>
  ({ name: 'thesis', copy_to: '', copy_into: '', targets: [target('wulver', { same: true }), target('yale')], ...over })
const project = { group: 'lab' } as Project
const spots = [{ label: 'Home', path: '/home/jdoe' }, { label: 'Project (lab)', path: '/project/lab/jdoe' },
  { label: 'Project (other)', path: '/project/other/jdoe' }, { label: 'Scratch', path: '/scratch/jdoe' }]

describe('inside', () => {
  it.each([['/project/lab', '/project/lab', true], ['/project/lab/run', '/project/lab/', true],
    ['/project/lab2', '/project/lab', false]])('%s in %s: %s', (into, path, want) =>
    expect(inside(into, path)).toBe(want))
})

describe('spotFor', () => {
  it('picks the deepest place that holds the folder', () => {
    const nested = [{ label: 'Home', path: '/home' }, { label: 'Mine', path: '/home/jdoe' }]
    expect(spotFor('/home/jdoe/x', nested)?.label).toBe('Mine')
  })
  it('finds nothing outside every place', () => expect(spotFor('/tmp', spots)).toBeUndefined())
})

describe('startFolder', () => {
  it('starts in home without a target', () => expect(startFolder(project, targets(), undefined, spots)).toBe('~'))
  it('goes where the last copy went', () =>
    expect(startFolder(project, targets({ copy_to: 'yale', copy_into: '/x' }), target('yale'), spots)).toBe('/x'))
  it('starts in project on another cluster', () =>
    expect(startFolder(project, targets(), target('yale'), spots)).toBe('/project/lab/jdoe'))
  it('starts in another group\'s project on its own cluster', () =>
    expect(startFolder(project, targets(), target('wulver', { same: true }), spots)).toBe('/project/other/jdoe'))
})
