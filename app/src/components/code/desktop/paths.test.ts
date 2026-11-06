import { describe, expect, it } from 'vitest'

import { folderName, inside, tilde } from './paths'

describe('inside', () => {
  it.each([
    ['/home/jdoe/p', '/home/jdoe/p', true],
    ['/home/jdoe/p/src/a.py', '/home/jdoe/p', true],
    ['/home/jdoe/p/src', '/home/jdoe/p/', true],
    ['/home/jdoe/pq', '/home/jdoe/p', false],
    ['/home/jdoe/p', '', false],
  ])('%s in %s is %s', (path, folder, want) => expect(inside(path, folder)).toBe(want))
})

describe('tilde', () => {
  it('writes home as ~', () => expect(tilde('/home/jdoe/x', '/home/jdoe')).toBe('~/x'))
  it('leaves other paths', () => expect(tilde('/scratch/x', '/home/jdoe')).toBe('/scratch/x'))
  it('leaves paths without a home', () => expect(tilde('/home/jdoe/x', '')).toBe('/home/jdoe/x'))
})

describe('folderName', () => {
  const projects = [{ path: '/home/jdoe/p', name: 'Project P' }] as Parameters<typeof folderName>[2]
  it('uses the project name', () => expect(folderName('/home/jdoe/p', '/home/jdoe', projects)).toBe('Project P'))
  it('calls home Home', () => expect(folderName('/home/jdoe', '/home/jdoe', projects)).toBe('Home'))
  it('uses the last part of the path', () => expect(folderName('/scratch/run/', '/home/jdoe', projects)).toBe('run'))
  it('calls the root /', () => expect(folderName('/', '/home/jdoe', projects)).toBe('/'))
})
