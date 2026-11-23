import { describe, expect, it } from 'vitest'

import real from './fixtures/stop-and-rewind.json'
import { items, type ReadAnswer } from './model'
import { empty, merge, onBranch } from './state'

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

// From a real Claude Code (2026-11-22, made-up paths): a message stopped before Claude answered, then sent again
// (Claude gave it back and the next message ran into it), a rewind to "Also: what is 2+2?" (Esc Esc) and a new
// message from there, and at the end a message Claude gave back, still in its box.

const read = real as unknown as Required<Pick<ReadAnswer, 'events' | 'links'>>
const said = (s: ReturnType<typeof merge>, draft = '') =>
  items(onBranch(s), '', draft).flatMap((i) => i.kind === 'note' ? [`(${i.text})`] : i.kind === 'user' ? [i.text] : [])

describe('the conversation as it stands, after stopping and going back (2026-11-22 report)', () => {
  it('what a rewind went back on is left out; what was sent after it stays', () => {
    const s = merge(empty(), { file: F, offset: 9000, ...read })
    const shown = said(s)
    expect(shown).toContain('Also: what is 2+2?What is 3+3?')
    expect(shown).not.toContain('Also: what is 2+2?')  // gone back on
    expect(shown).not.toContain('Write a 400 word story about a fox.')
    expect(shown).not.toContain('Make it funny please.')
    // the stopped message Claude gave back is not shown as sent: only the one sent after it
    expect(shown.filter((t) => t.startsWith('Count slowly'))).toHaveLength(1)
  })

  it('every event stays without links (an older backend), and before any branch', () => {
    const s = merge(empty(), { file: F, offset: 9000, events: read.events })
    expect(onBranch(s)).toHaveLength(read.events.length)
  })

  it('the same holds when the file comes in several reads', () => {
    const half = Math.floor(read.links.length / 2)
    const cut = read.events.findIndex((e) => e.line === read.links[half][0])
    let s = merge(empty(), { file: F, offset: 10, events: read.events.slice(0, cut), links: read.links.slice(0, half) })
    s = merge(s, { file: F, offset: 9000, events: read.events.slice(cut), links: read.links.slice(half) })
    expect(said(s)).toEqual(said(merge(empty(), { file: F, offset: 9000, ...read })))
  })

  it('a message Claude gave back, still in its box, is not shown as sent', () => {
    const s = merge(empty(), { file: F, offset: 9000, ...read })
    const draft = 'Write a long poem about snow.\nMake every stanza rhyme.'
    expect(said(s).at(-1)).toBe(draft)
    expect(said(s, draft)).not.toContain(draft)
    expect(said(s, 'something else').at(-1)).toBe(draft)  // only that very message
  })

  it("Claude's interrupted line reads as a note", () => {
    expect(said(merge(empty(), { file: F, offset: 9000, ...read }))).toContain('(Stopped)')
  })

  it('a new file links only its own lines: what the old one showed stays', () => {
    let s = merge(empty(), { file: F, offset: 9000, ...read })
    const before = onBranch(s).length
    s = merge(s, { file: F.replace('3f2a', '9b9b'), offset: 5, events: [{ kind: 'user', id: 'n1', text: 'new', line: 'n1' }],
      links: [['n1', '']] })
    expect(onBranch(s)).toHaveLength(before + 2)  // the note and the new message
  })
})
