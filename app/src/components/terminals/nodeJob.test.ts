import { describe, expect, it } from 'vitest'

import type { Job } from '../../types/jobs'
import { duration } from './monitorFormat'
import { jobOfSession, jobText, jobTip, nodeJob } from './nodeJob'
import barSource from './MonitorBar.tsx?raw'
import viewSource from './TerminalView.tsx?raw'

// 2026-11-22, the owner: show the job id in the terminal, to check whether the job really finished
const job = (over: Partial<Job>): Job => ({
  job_id: '1621596', name: 'claude_session', user: 'jdoe', partition: 'general', state: 'RUNNING', elapsed: '',
  limit: '', cpus: '2', mem: '8G', where: 'n0042', qos: 'standard', billing: 0, factor: 1, from_app: true,
  su_spent: 0, su_max: 0, su: '', seconds: 3600, limit_seconds: 4 * 3600, elapsed_text: '', limit_text: '',
  reason: '', qos_shown: '', cancellable: true, ...over,
})

describe('the job of a tab', () => {
  it('an agent tab names its job', () => {
    expect(jobOfSession('hpchub-claude-1621596-3f2a9c1e')).toBe('1621596')
    expect(jobOfSession('hpchub-codex-1621596-101010')).toBe('1621596')
    expect(jobOfSession('hpchub-ask-1621596-101010')).toBe('1621596')
  })

  it('a plain terminal, an install tab or your own tmux session names none', () => {
    expect(jobOfSession('hpchub-term-1122-101010')).toBe('')  // a date and time, not a job
    expect(jobOfSession('hpchub-install-claude-101010')).toBe('')
    expect(jobOfSession('work')).toBe('')
  })

  it('running: its id and the time before its limit', () => {
    const j = nodeJob('hpchub-claude-1621596-3f2a9c1e', 'n0042', [job({})])!
    expect(j).toEqual({ id: '1621596', state: 'running', left: 3 * 3600 })
    expect(jobText(j, duration)).toBe(`job 1621596 · ${duration(3 * 3600)} left`)
    expect(jobTip(j, 'n0042', duration)).toContain('running')
  })

  it('a job no longer in your jobs has ended', () => {
    const j = nodeJob('hpchub-claude-1621596-3f2a9c1e', 'n0042', [job({ job_id: '1700000' })])!
    expect(j.state).toBe('ended')
    expect(jobText(j, duration)).toBe('job 1621596 ended')
    expect(jobTip(j, 'n0042', duration)).toContain('has ended')
  })

  it('waiting in the queue says so', () => {
    expect(nodeJob('hpchub-claude-1621596-3f2a9c1e', '', [job({ state: 'PENDING' })])!.state).toBe('waiting')
  })

  it('before your jobs are read: the id alone, never "ended"', () => {
    const j = nodeJob('hpchub-claude-1621596-3f2a9c1e', 'n0042', null)!
    expect(j.state).toBe('unknown')
    expect(jobText(j, duration)).toBe('job 1621596')
  })

  it('a plain terminal on a node: your running job there', () => {
    const jobs = [job({ job_id: '1', where: 'n0001' }), job({ job_id: '2', where: 'n0041,n0042' })]
    expect(nodeJob('hpchub-term-1122-101010', 'n0042', jobs)?.id).toBe('2')
    expect(nodeJob('hpchub-term-1122-101010', 'n0099', jobs)).toBeNull()
    expect(nodeJob('hpchub-term-1122-101010', '', jobs)).toBeNull()  // the login node: no job
  })

  it('a job with no time limit shows no time left', () => {
    const j = nodeJob('hpchub-claude-1621596-3f2a9c1e', 'n0042', [job({ limit_seconds: 0 })])!
    expect(jobText(j, duration)).toBe('job 1621596')
  })

  it('the bar under every session tab shows it', () => {
    expect(barSource).toContain('nodeJob(session, node, useMyJobs(')
    expect(viewSource).toMatch(/<MonitorBar cluster=\{tab\.cluster\} session=\{tab\.session\}/)
  })
})
