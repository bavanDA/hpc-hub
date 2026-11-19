import { describe, expect, it } from 'vitest'

import type { Cluster } from '../../../types/clusters'
import onboarding from '../Onboarding.tsx?raw'
import { setupSteps } from './step'

const cluster = (id: string) => ({ id, name: id }) as Cluster

// 2026-11-19: first-time setup should ask only the username (UCID) and password, not the compute node (owner)
describe('first-time setup', () => {
  it('asks one thing per cluster: how you sign in', () => {
    const steps = setupSteps(['wulver', 'yale'], [cluster('yale'), cluster('wulver')])
    expect(steps.map((s) => [s.cluster.id, s.kind])).toEqual([['wulver', 'login'], ['yale', 'login']])
  })
  it('never a compute node step', () => {
    expect(setupSteps(['wulver'], [cluster('wulver')]).every((s) => s.kind === 'login')).toBe(true)
    expect(onboarding).not.toContain('NodeStep')
  })
  it('a cluster that is gone is left out, and none at all is no steps', () => {
    expect(setupSteps(['gone', 'wulver'], [cluster('wulver')]).map((s) => s.cluster.id)).toEqual(['wulver'])
    expect(setupSteps([], [cluster('wulver')])).toEqual([])
  })
})
