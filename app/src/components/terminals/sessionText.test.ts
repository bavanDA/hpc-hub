import { describe, expect, it } from 'vitest'

import type { TmuxSession } from '../../types/terminals'
import { ago, folderText, sessionLines, withOpened } from './sessionText'
import type { Tab } from './tabs'

const NOW = 1_800_000_000
const session = (over: Partial<TmuxSession> = {}): TmuxSession => ({
  name: 'main', kind: 'tmux', created: NOW - 300, attached: 0, label: '', color: '', command: 'bash', windows: 1,
  path: '', remote: '', node: '', title: 'main', agent: '', job: '', ...over,
})

describe('ago', () => {
  it.each([[NOW - 59, '0 min'], [NOW - 600, '10 min'], [NOW - 3 * 3600, '3 h'], [NOW - 3 * 86400, '3 days']])(
    '%d reads %s', (ts, want) => expect(ago(ts, NOW)).toBe(want))
  it('is empty when not known', () => expect(ago(0, NOW)).toBe(''))
})

describe('sessionLines', () => {
  it('says what runs, since when and that it runs', () =>
    expect(sessionLines(session(), false, null, NOW)).toEqual({ title: 'main', sub: 'Terminal · 5 min · running' }))
  it('says open, or open elsewhere', () => {
    expect(sessionLines(session(), true, null, NOW).sub).toBe('Terminal · 5 min · open')
    expect(sessionLines(session({ attached: 1 }), false, null, NOW).sub).toBe('Terminal · 5 min · open elsewhere')
  })
  it('drops the kind from the title and does not say it twice', () =>
    expect(sessionLines(session({ agent: 'claude', title: 'Claude · thesis' }), false, null, NOW))
      .toEqual({ title: 'thesis', sub: 'Claude · 5 min · running' }))
  it('names the job node, or that it was released', () => {
    expect(sessionLines(session({ job: '42' }), false, { 42: 'n0101' }, NOW).sub).toBe('Terminal · n0101 · 5 min · running')
    expect(sessionLines(session({ job: '42' }), false, {}, NOW).sub).toBe('Terminal · node released · 5 min')
  })
})

describe('folderText', () => {
  const homes = ['/home/jdoe', '/mmfs1/home/jdoe']
  it('writes your home as ~', () => {
    expect(folderText('/home/jdoe', homes)).toBe('~')
    expect(folderText('/mmfs1/home/jdoe/thesis/src', homes)).toBe('~/thesis/src')
    expect(folderText('/home/jdoe2/x', homes)).toBe('/home/jdoe2/x')
    expect(folderText('/scratch/jdoe/run', homes)).toBe('/scratch/jdoe/run')
  })
  it('keeps the last folders of a long one', () =>
    expect(folderText('/project/ab123/jdoe/experiments/2026/graph-search/results', homes, 30))
      .toBe('…/2026/graph-search/results'))
  it('is empty when not known', () => expect(folderText('', homes)).toBe(''))
})

describe('withOpened', () => {
  const tab = (over: Partial<Tab>) => ({ cluster: 'wulver', session: 'new', kind: 'tmux', node: '', title: 'new',
    color: '', ...over }) as Tab
  it('puts a session just opened here first', () =>
    expect(withOpened([session()], [tab({})], 'wulver').map((s) => s.name)).toEqual(['new', 'main']))
  it('skips listed ones, other clusters and logs', () =>
    expect(withOpened([session()], [tab({ session: 'main' }), tab({ cluster: 'yale' }), tab({ session: '' })], 'wulver')
      .map((s) => s.name)).toEqual(['main']))
})
