import { describe, expect, it } from 'vitest'

import { empty, merge } from './state'

const F = '~/.claude/projects/-home-jdoe-proj/3f2a9c1e.jsonl'

describe('reads add up', () => {
  it('the first read, then only what is new, each event once', () => {
    let s = merge(empty(), { file: F, offset: 100, trimmed: true, cwd: '/home/jdoe/proj',
      events: [{ kind: 'user', id: 'u1', text: 'hi' }] })
    expect([s.waiting, s.trimmed, s.offset, s.cwd]).toEqual([false, true, 100, '/home/jdoe/proj'])
    s = merge(s, { file: F, offset: 180, trimmed: false, events: [{ kind: 'user', id: 'u1', text: 'hi' },
      { kind: 'text', id: 'a1', text: 'hello' }] })
    expect(s.events.map((e) => e.id)).toEqual(['u1', 'a1'])
    expect(s.trimmed).toBe(true)  // still: the start was never read
  })

  it('after /clear the new file follows a note', () => {
    let s = merge(empty(), { file: F, offset: 10, events: [{ kind: 'user', id: 'u1', text: 'hi' }] })
    s = merge(s, { file: F.replace('3f2a', '9b9b'), offset: 5, events: [{ kind: 'user', id: 'u9', text: 'again' }] })
    expect(s.events.map((e) => e.kind === 'note' ? 'note' : e.id)).toEqual(['u1', 'note', 'u9'])
  })

  it('a file that started over starts the view over', () => {
    let s = merge(empty(), { file: F, offset: 10, events: [{ kind: 'user', id: 'u1', text: 'hi' }] })
    s = merge(s, { file: F, offset: 3, reset: true, events: [{ kind: 'user', id: 'u2', text: 'new' }] })
    expect(s.events.map((e) => e.id)).toEqual(['u2'])
  })

  it('a chat HPC Hub cannot follow says so; one it already showed keeps showing', () => {
    expect(merge(empty(), { waiting: true, unknown: true }).unknown).toBe(true)
    const shown = merge(empty(), { file: F, offset: 10, events: [] })
    expect(merge(shown, { waiting: true }).waiting).toBe(false)
  })
})
