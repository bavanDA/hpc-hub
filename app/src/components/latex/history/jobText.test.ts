import { describe, expect, it } from 'vitest'

import type { SwitchDone, SyncDone, SyncState } from '../../../types/history'
import { busyLabel, switchedText, switchSteps, syncedText } from './jobText'

const done = (r: Partial<SwitchDone>): SwitchDone => ({ branch: 'main', from: 'draft', brought: 0, kept: 0, back: '', ...r })
const synced = (r: Partial<SyncDone>): SyncDone =>
  ({ done: true, push: true, branch: 'main', pulled: 0, pulled_by: '', pushed: 0, back: 0, ...r })

describe('switchSteps', () => {
  it('lists the safe copy and the fetch only when they happen', () => {
    expect(switchSteps(0, 0, 1)).toEqual(['Updating 1 file', 'Rebuild the PDF'])
    expect(switchSteps(2, 1, 5)).toEqual(['Made a safe copy of your 2 changes', 'Got the latest from origin',
      'Updating 5 files', 'Rebuild the PDF'])
  })
})

describe('switchedText', () => {
  it('says what happened to your changes', () => {
    expect(switchedText('main', done({}))).toBe('Now on main.')
    expect(switchedText('main', done({ brought: 1 }))).toBe('Now on main. Your 1 change came along.')
    expect(switchedText('main', done({ kept: 3 }))).toBe('Now on main. Your changes wait on draft.')
    expect(switchedText('main', done({ back: 'back' }))).toBe('Now on main. Your changes kept here are back.')
    expect(switchedText('main', done({ back: 'kept' })))
      .toBe('Now on main. Your changes kept here clash now, so they wait in Saved versions.')
  })
})

describe('syncedText', () => {
  it('covers push and pull, with and without news', () => {
    expect(syncedText(synced({ pushed: 2 }))).toBe('Pushed 2 commits')
    expect(syncedText(synced({}))).toBe('Nothing new to push')
    expect(syncedText(synced({ push: false, pulled: 1 }))).toBe('Got 1 new commit')
    expect(syncedText(synced({ push: false }))).toBe('Already up to date')
  })

  it('adds the changes that came back', () => {
    expect(syncedText(synced({ pushed: 1, back: 1 }))).toBe('Pushed 1 commit, your 1 change is back')
    expect(syncedText(synced({ push: false, back: 2 }))).toBe('Already up to date, your 2 changes are back')
  })
})

describe('busyLabel', () => {
  const paused = { push: true, spots: [{}, {}] } as unknown as SyncState
  it('puts a switch first, then a running or paused push', () => {
    expect(busyLabel('main', { push: true, error: '' }, null)).toEqual({ label: 'Switching to main' })
    expect(busyLabel(null, { push: true, error: '' }, null)).toEqual({ label: 'Pushing' })
    expect(busyLabel(null, { push: false, error: '' }, null)).toEqual({ label: 'Getting the latest' })
    expect(busyLabel(null, { push: true, error: '' }, paused)).toEqual({ label: 'Push paused: 2 spots to settle' })
    expect(busyLabel(null, { push: false, error: '' }, paused)).toEqual({ label: 'Update paused: 2 spots to settle' })
  })

  it('is idle without a job or after a failed one', () => {
    expect(busyLabel(null, null, null)).toBeNull()
    expect(busyLabel(null, { push: true, error: 'rejected' }, null)).toBeNull()
  })
})
