import { describe, expect, it } from 'vitest'

import type { Job } from '../../types/jobs'
import type { Account } from '../../types/usage'
import { detailGroups } from './details'
import {
  filterJobs, memText, nameList, queue, ranFor, reasonText, sortJobs, stateName, timeShare, usageText,
} from './format'

const job = (over: Partial<Job> = {}): Job => ({
  job_id: '100', name: 'train', user: 'jdoe', partition: 'gpu', state: 'RUNNING', elapsed: '1:00:00', limit: '4:00:00',
  cpus: '8', mem: '16G', where: 'n0101', qos: '', billing: 8, factor: 1, from_app: false, su_spent: 8, su_max: 32,
  su: '8.0 / 32', seconds: 3600, limit_seconds: 14_400, elapsed_text: '1 h', limit_text: '4 h', reason: '',
  qos_shown: '', cancellable: true, ...over,
})
const account = (over: Partial<Account>): Account => ({ account: 'mygroup', quota: 0, used: 0, mine: 0, period: '', rate: 0, ...over })

describe('stateName', () => {
  it.each([['PENDING', 'Waiting'], ['OUT_OF_MEMORY', 'Out of memory'], ['RUNNING', 'Running'],
    ['BOOT_FAIL', 'Boot fail']])('%s reads %s', (s, want) => expect(stateName(s)).toBe(want))
})

describe('memText', () => {
  it.each([['16G', '16 GB'], ['500m', '500 MB'], ['1.5T', '1.5 TB'], ['4000', '4000']])('%s is %s', (m, want) =>
    expect(memText(m)).toBe(want))
})

describe('queue', () => {
  it('joins partition and QoS', () => expect(queue(job({ qos: 'short' }))).toBe('gpu · short'))
  it('leaves out an empty QoS', () => expect(queue(job())).toBe('gpu'))
})

describe('sortJobs', () => {
  const jobs = [job({ job_id: '9', name: 'b' }), job({ job_id: '10', name: 'a' }), job({ job_id: '11', name: 'b' })]
  it('sorts ids as numbers', () => expect(sortJobs(jobs, 'id', false).map((j) => j.job_id)).toEqual(['9', '10', '11']))
  it('sorts down', () => expect(sortJobs(jobs, 'id', true).map((j) => j.job_id)).toEqual(['11', '10', '9']))
  it('puts newer first among equals', () =>
    expect(sortJobs(jobs, 'name', false).map((j) => j.job_id)).toEqual(['10', '11', '9']))
  it('leaves the list it got alone', () => {
    sortJobs(jobs, 'id', true)
    expect(jobs[0].job_id).toBe('9')
  })
})

describe('filterJobs', () => {
  const jobs = [job({ job_id: '1', state: 'PENDING', reason: 'Priority' }), job({ job_id: '2', name: 'Thesis run' })]
  it('keeps one state', () => expect(filterJobs(jobs, 'PENDING', '').map((j) => j.job_id)).toEqual(['1']))
  it('finds text anywhere, any case', () => expect(filterJobs(jobs, '', ' thesis ').map((j) => j.job_id)).toEqual(['2']))
  it('finds the reason', () => expect(filterJobs(jobs, '', 'prio').map((j) => j.job_id)).toEqual(['1']))
  it('keeps all with no filter', () => expect(filterJobs(jobs, '', '')).toHaveLength(2))
})

describe('usageText', () => {
  it('says what is left under a limit', () =>
    expect(usageText([account({ quota: 1000, used: 500, mine: 20 })]))
      .toBe('mygroup: 500 hours left (SU) of 1,000, you used 20'))
  it('says what was used without a limit, SU once', () =>
    expect(usageText([account({ used: 10, period: 'FY27' }), account({ account: 'abc123', used: 5, mine: 1 })]))
      .toBe('mygroup: 10 hours used (SU) in FY27, you used 0 · abc123: 5 hours used, you used 1'))
  it('shows the first account when none was used', () =>
    expect(usageText([account({}), account({ account: 'abc123' })])).toBe('mygroup: 0 hours used (SU), you used 0'))
})

describe('reasonText', () => {
  it('drops the leading Waiting', () => expect(reasonText('waiting: higher-priority jobs go first'))
    .toBe('Higher-priority jobs go first'))
})

describe('ranFor', () => {
  it.each([['3:41:10', '3 h 41 min'], ['1-02:00:00', '1 d 2 h'], ['12:30', '12 min'], ['0:10', '1 min'],
    ['2:00:00', '2 h']])('%s ran for %s', (t, want) => expect(ranFor(t)).toBe(want))
})

describe('timeShare', () => {
  it('is the part of the limit used', () => expect(timeShare(job())).toBe(0.25))
  it('is full when timed out', () => expect(timeShare(job({ state: 'TIMEOUT' }))).toBe(1))
  it('is 0 without a limit', () => expect(timeShare(job({ limit_seconds: 0 }))).toBe(0))
})

describe('nameList', () => {
  it('lists a few', () => expect(nameList(['a', 'b'])).toBe('a, b.'))
  it('cuts after six', () => expect(nameList(['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'])).toBe('a, b, c, d, e, f and 2 more.'))
})

describe('detailGroups', () => {
  it('shows the id alone while loading', () =>
    expect(detailGroups([], job())).toEqual([{ title: '', rows: [{ label: 'Job ID', value: '100' }] }]))
  it('puts the id first, drops what the top says and adds the SU cost', () => {
    const got = detailGroups([
      { title: 'Status', rows: [{ label: 'State', value: 'RUNNING' }, { label: 'Node', value: 'n0101' }] },
      { title: 'Resources', rows: [{ label: 'CPUs', value: '8' }] },
    ], job())
    expect(got).toEqual([
      { title: '', rows: [{ label: 'Job ID', value: '100' }, { label: 'Node', value: 'n0101' }] },
      { title: 'Resources', rows: [{ label: 'CPUs', value: '8' }, { label: 'Hours (SU)', value: '8.0 / 32' }] },
    ])
  })
})
