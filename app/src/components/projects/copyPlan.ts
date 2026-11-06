import type { CopyPlan, CopyTargets } from '../../types/projects'

export type How = 'laptop' | 'globus'

export const BIG = 5 * 1024 ** 3

export const defaultTarget = (t: CopyTargets) =>
  t.targets.find((x) => x.id === t.copy_to) ?? t.targets.find((x) => !x.same) ?? t.targets[0]

export function measureNote(planError: string, plan: CopyPlan | null): string {
  if (planError || plan?.parts_error) return `Could not measure it: ${planError || plan?.parts_error}`
  return plan ? 'Untick what stays behind.' : 'Measuring sizes'
}
