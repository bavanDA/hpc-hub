import { describe, expect, it } from 'vitest'

import type { Cluster } from '../../types'
import type { Partition, StorageRow } from '../../types/usage'
import { n, pct } from './format'
import { busiest, fullName, purgeDays, queueText, storageSize } from './summary'

const row = (over: Partial<StorageRow>): StorageRow => ({ label: 'Project', used: 0, quota: 0, mine: null, people: {}, ...over })
const queue = (over: Partial<Partition>): Partition => ({
  name: 'general', up: true, nodes: 10, cpus_used: 94, cpus_total: 100, gpus_used: 0, gpus_total: 0,
  running: 5, pending: 0, ...over,
})

describe('format', () => {
  it('groups thousands', () => expect(n(12345)).toBe('12,345'))
  it('keeps the digits asked for', () => expect(n(1.5, 2)).toBe('1.50'))
  it('writes a percent with one digit', () => expect(pct(1, 3)).toBe('33.3%'))
  it('is 0% of nothing', () => expect(pct(5, 0)).toBe('0%'))
})

describe('fullName', () => {
  it('drops the part in brackets', () => expect(fullName({ name: 'Wulver (NJIT)' } as Cluster)).toBe('Wulver'))
})

describe('busiest', () => {
  it('picks the one that used most', () =>
    expect(busiest([{ used: 1 }, { used: 9 }, { used: 3 }] as never[])).toEqual({ used: 9 }))
  it('is null for none', () => expect(busiest([])).toBeNull())
})

describe('storageSize', () => {
  it('stays in GB when small', () => expect(storageSize(row({ used: 40, quota: 50 }))).toBe('40 of 50 GB'))
  it('goes to TB when big', () => expect(storageSize(row({ used: 1463, quota: 2048 }))).toBe('1.4 of 2 TB'))
  it('says used without a quota', () => expect(storageSize(row({ used: 1536 }))).toBe('1.5 TB used'))
  it('says used in GB without a quota', () => expect(storageSize(row({ used: 12 }))).toBe('12 GB used'))
})

describe('queueText', () => {
  it('is quiet when nothing waits', () => expect(queueText([queue({})])).toBe('quiet'))
  it('names the queue with most waiting', () =>
    expect(queueText([queue({ pending: 3 }), queue({ name: 'gpu', pending: 102 })])).toBe('gpu 94% busy, 102 waiting'))
  it('skips queues that are down', () => expect(queueText([queue({ up: false, pending: 50 })])).toBe('quiet'))
  it('leaves out busy when the size is unknown', () =>
    expect(queueText([queue({ cpus_total: 0, pending: 2 })])).toBe('general 2 waiting'))
})

describe('purgeDays', () => {
  it('uses what the cluster says', () => expect(purgeDays(row({ purged: 30 }))).toBe(30))
  it('marks scratch without a stated purge', () => expect(purgeDays(row({ label: 'Scratch' }))).toBe(-1))
  it('is 0 for the rest', () => expect(purgeDays(row({}))).toBe(0))
})
