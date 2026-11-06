import { describe, expect, it } from 'vitest'

import type { ClaudePermissions } from '../../types/permissions'
import { draftOf } from './draft'

const perms: ClaudePermissions = {
  name: 'Alder', allowed: ['squeue', 'ls', 'git status'], custom: ['make'], trash: true, ask: ['rm', 'mv'],
  accept_edits: false, groups: [], asks: [],
  lock: { set_up: false, locked: false, config: { tries: 5 }, open: 0, log: [] },
}

describe('draftOf', () => {
  it('sorts allowed and ask', () => {
    const d = draftOf(perms)
    expect(d.allowed).toEqual(['git status', 'ls', 'squeue'])
    expect(d.ask).toEqual(['mv', 'rm'])
  })

  it('leaves the loaded lists as they were', () => {
    draftOf(perms)
    expect(perms.allowed).toEqual(['squeue', 'ls', 'git status'])
    expect(perms.ask).toEqual(['rm', 'mv'])
  })

  it('copies the switches and fills the lock defaults', () => {
    const d = draftOf(perms)
    expect(d).toMatchObject({ custom: ['make'], trash: true, accept_edits: false })
    expect(d.lock).toEqual({ minutes: 10, tries: 5, logout: true, scancel: true })
  })
})
