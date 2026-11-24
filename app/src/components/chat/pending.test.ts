// 2026-11-24 report: "when I send msg in claude chat, it doesn't look real". Your message showed only once Claude
// wrote it to its file, seconds later; now a dimmed copy shows at once and goes when Claude's file has it.
import { describe, expect, it } from 'vitest'

import type { Item } from './model'
import { PENDING_MS, QUEUED_MS, pend, pendingNote, pends, settle } from './pending'

const user = (id: string, text: string): Item => ({ kind: 'user', id, text })
const reply = (id: string, text: string): Item => ({ kind: 'text', id, text })

describe('a message you send', () => {
  it('shows at once, unless it is a / command or a ! shell line', () => {
    expect(pends('can you rerun the job on wulver?')).toBe(true)
    expect(pends('/compact')).toBe(false)
    expect(pends('  /model opus')).toBe(false)
    expect(pends('! squeue -u jdoe')).toBe(false)
    expect(pends('   \n')).toBe(false)
  })

  it('goes once Claude\'s file has it (spaces and lines as Claude wrote them)', () => {
    const p = pend('rename them\nand update  the html', [], [], 1_000, 'p1')
    expect(settle([p], [], '', 2_000)).toEqual({ left: [p], took: [] })
    const now = [user('u1', 'rename them and update the html')]
    expect(settle([p], now, '', 3_000)).toEqual({ left: [], took: ['u1'] })
  })

  it('the same text sent before is not this one: it waits for one more', () => {
    const before = [user('u1', 'yes'), reply('t1', 'Done.')]
    const p = pend('yes', before, [], 1_000, 'p1')
    expect(p.before).toBe(1)
    expect(settle([p], before, '', 2_000).left).toEqual([p])
    expect(settle([p], [...before, user('u2', 'yes')], '', 3_000).took).toEqual(['u2'])
  })

  it('two the same, one after the other, wait for two', () => {
    const a = pend('go on', [], [], 1_000, 'p1')
    const b = pend('go on', [], [a], 1_100, 'p2')
    expect(b.before).toBe(1)
    const one = [user('u1', 'go on')]
    expect(settle([a, b], one, '', 2_000)).toEqual({ left: [b], took: ['u1'] })
    expect(settle([b], [...one, user('u2', 'go on')], '', 2_500)).toEqual({ left: [], took: ['u2'] })
    // the first already in Claude's file when the second is sent: the second waits for the next one only
    const c = pend('go on', one, [a], 3_000, 'p3')
    expect(c.before).toBe(1)
  })

  it('only messages of yours count, not Claude saying the same', () => {
    const p = pend('ok', [], [], 1_000, 'p1')
    expect(settle([p], [reply('t1', 'ok'), { kind: 'command', id: 'c1', text: 'ok' }], '', 2_000).left).toEqual([p])
  })

  it('goes when Claude gives it back unsent, and after a long while', () => {
    const p = pend('check the logs', [], [], 1_000, 'p1')
    expect(settle([p], [], 'check   the logs', 40_000).left).toEqual([])
    expect(settle([p], [], 'something else', 40_000).left).toEqual([p])
    expect(settle([p], [], '', 1_000 + PENDING_MS).left).toEqual([p])
    expect(settle([p], [], '', 1_000 + PENDING_MS + 1).left).toEqual([])
  })

  it('says Sending…, and Waiting for Claude… a few seconds on while Claude works', () => {
    const p = pend('hi', [], [], 1_000, 'p1')
    expect(pendingNote(p, false, 1_500)).toBe('Sending…')
    expect(pendingNote(p, true, 1_500)).toBe('Sending…')
    expect(pendingNote(p, true, 1_000 + QUEUED_MS)).toBe('Waiting for Claude…')
    expect(pendingNote(p, false, 1_000 + QUEUED_MS)).toBe('Sending…')
  })
})
