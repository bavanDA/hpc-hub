import { beforeEach, describe, expect, it, vi } from 'vitest'

const calls = vi.hoisted(() => [] as { method: string; params: Record<string, unknown> }[])
const answer = vi.hoisted(() => ({ window: null as unknown, outline: null as unknown }))

vi.mock('../../../rpc', () => ({
  call: vi.fn(async (method: string, params: Record<string, unknown>) => {
    calls.push({ method, params })
    if (method === 'terminals.history') return answer.window
    if (method === 'terminals.outline') return answer.outline
    if (method === 'terminals.marks') return { marks: [], ended: false }
    return null
  }),
}))
vi.mock('../../../theme', () => ({ isDark: () => false, onThemeChange: () => () => {} }))

import type { Tab } from '../tabs'
import { CHUNK, HistoryView, blockAround, stepFrom } from './view'

const flush = () => new Promise((r) => setTimeout(r, 0))
const win = (extra: object = {}) => ({ start: 0, rows: ['a'], total: 1000, history: 960, limit: 50000, height: 40,
  width: 80, alternate: false, in_mode: false, ...extra })
const tab = { key: 'wulver/x', cluster: 'wulver', session: 'x', node: 'n1', term: { focus: () => {} } } as unknown as Tab
const made = (rows: Record<number, string>) => (y: number) => y in rows ? !rows[y].trim() : undefined

describe('blockAround', () => {
  it('grows to the non blank lines around the row', () => {
    expect(blockAround(2, made({ 0: 'x', 1: 'a', 2: 'b', 3: 'c', 4: ' ' }))).toEqual([0, 3])
  })

  it('stops at unknown lines and at blank ones', () => {
    expect(blockAround(1, made({ 1: 'a' }))).toEqual([1, 1])
    expect(blockAround(1, made({ 1: ' ' }))).toEqual([1, 1])
  })
})

describe('stepFrom', () => {
  it('finds the next row, or the one before, or none', () => {
    expect(stepFrom([10, 20, 30], 15, 1)).toBe(20)
    expect(stepFrom([10, 20, 30], 15, -1)).toBe(10)
    expect(stepFrom([10, 20], 25, 1)).toBeUndefined()
  })
})

describe('HistoryView', () => {
  beforeEach(() => { calls.length = 0; answer.window = win(); answer.outline = { ...win(), map: [], prompts: [] } })

  it('a scroll up asks the end of the history and opens the reading copy', async () => {
    const v = new HistoryView(tab)
    expect(v.wheel(-120)).toBe(true)
    await flush()
    expect(calls[0]).toMatchObject({ method: 'terminals.history', params: { start: null, count: CHUNK } })
    expect(v.reading).toBe(true)
    expect(v.top).toBeLessThan(1000)
  })

  it('a full screen program keeps the wheel for tmux', async () => {
    answer.window = win({ alternate: true })
    const v = new HistoryView(tab)
    v.wheel(-120)
    await flush()
    expect(v.reading).toBe(false)
    expect(v.wheel(-120)).toBe(false)  // passes straight through now
  })

  it('a session gone says ended, and does not open', async () => {
    answer.window = { gone: true }
    const v = new HistoryView(tab)
    v.wheel(-120)
    await flush()
    expect(v.ended).toBe(true)
    expect(v.reading).toBe(false)
  })

  it('reads only when you read: no calls until opened, windows bounded', async () => {
    vi.useFakeTimers()
    const v = new HistoryView(tab)
    expect(calls).toHaveLength(0)
    v.total = 2000
    v.visibleRows = 30
    v.openAt(900)
    await vi.advanceTimersByTimeAsync(200)
    const reads = calls.filter((c) => c.method === 'terminals.history')
    expect(reads.length).toBeGreaterThan(0)
    expect(reads.length).toBeLessThanOrEqual(3)
    reads.forEach((r) => expect(r.params.count).toBe(CHUNK))
    vi.useRealTimers()
  })

  it('trimming drops what it has read, since every line moved', async () => {
    const v = new HistoryView(tab)
    answer.window = win({ start: 100, rows: ['old'], total: 2000, history: 1960 })
    v.total = 2000; v.history = 1960; v.visibleRows = 20
    await (v as unknown as { fetchChunk: (s: number) => Promise<void> }).fetchChunk(100)
    expect(v.rowAt(100)?.plain).toBe('old')
    answer.window = win({ start: 200, rows: ['new'], total: 1800, history: 1760 })
    await (v as unknown as { fetchChunk: (s: number) => Promise<void> }).fetchChunk(200)
    expect(v.rowAt(100)).toBeUndefined()
    expect(v.rowAt(200)?.plain).toBe('new')
  })
})

describe('marks', () => {
  beforeEach(() => { calls.length = 0 })

  it('sends only what the backend takes when adding a mark', async () => {
    await new HistoryView(tab).addMark('Results', { start: 3, rows: 2, text: 'a' })
    const sent = calls.find((c) => c.method === 'terminals.mark_add')!.params
    expect(Object.keys(sent).sort()).toEqual(['cluster', 'line', 'name', 'rows', 'session', 'text'])
  })
})

