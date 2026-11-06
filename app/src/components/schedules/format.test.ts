import { describe, expect, it, vi } from 'vitest'

import type { ScheduleStatus } from '../../types/schedules'
import { ownFrom } from './compute'
import { computeText, isBackupCheck, localWhen, status } from './format'

vi.mock('../../rpc', () => ({ call: vi.fn() }))  // gpus.ts asks the backend, which needs a window

const st = (over: Partial<ScheduleStatus>) => ({ enabled: true, state: '', start: '', ...over }) as ScheduleStatus

describe('status', () => {
  it('says running first, even when paused', () =>
    expect(status(st({ state: 'RUNNING', enabled: false }))).toEqual({ kind: 'ok', label: 'Running', note: 'Running now' }))
  it('says paused', () => expect(status(st({ enabled: false, state: 'PENDING' })).label).toBe('Paused'))
  it('says when the waiting job starts, in cluster time', () =>
    expect(status(st({ state: 'PENDING', start: '2026-10-20T02:00:00' }))).toEqual(
      { kind: 'dim', label: 'Waiting', note: 'Next Oct 20 02:00' }))
  it('warns when nothing is queued', () => expect(status(st({})).kind).toBe('warn'))
})

describe('localWhen', () => {
  it('writes month, day and time on this clock', () => {
    const d = new Date(2026, 9, 5, 7, 3)
    expect(localWhen(d.getTime() / 1000)).toBe('Oct 5 07:03')
  })
})

describe('computeText', () => {
  it('lists cores, memory and GPUs', () =>
    expect(computeText({ cpus: 4, mem_gb: 16, gpus: 2, gpu_type: 'a100' })).toMatch(/^4 cores · 16 GB · 2 × /))
  it('leaves out what is not set', () => expect(computeText({ cpus: 1 })).toBe('1 core'))
})

describe('ownFrom', () => {
  it('fills what the schedule leaves out from the profile', () => {
    const p = { cpus: 8, mem_gb: 32, partition: 'general', account: 'mygroup' } as never
    expect(ownFrom(p, { cpus: 2, qos: 'low' })).toEqual(
      { cpus: 2, mem_gb: 32, gpus: 0, gpu_type: '', partition: 'general', account: 'mygroup', qos: 'low' })
  })
})

describe('isBackupCheck', () => {
  it('knows the backup runner', () => expect(isBackupCheck(st({ name: 'nightly', runner: 'backup' }))).toBe(true))
  it('knows the backup-check name', () => expect(isBackupCheck(st({ name: 'backup-check' }))).toBe(true))
  it('leaves agent schedules alone', () => expect(isBackupCheck(st({ name: 'nightly', runner: 'agent' }))).toBe(false))
})
