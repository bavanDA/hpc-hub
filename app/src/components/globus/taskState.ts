import type { Task } from '../../types/globus'

export function state(t: Task): [string, 'ok' | 'bad' | 'warn' | 'dim'] {
  if (t.status === 'SUCCEEDED') return ['Done', 'ok']
  if (t.status === 'FAILED') return [t.cancelled ? 'Cancelled' : 'Failed', t.cancelled ? 'dim' : 'bad']
  if (t.problem) return [t.problem.replace(/_/g, ' ').toLowerCase().replace(/^./, (c) => c.toUpperCase()), 'warn']
  if (t.status === 'INACTIVE') return ['Paused', 'warn']
  return ['Running', 'ok']
}

/** Why a transfer failed, in words: Globus' problem code, else its status line. */
export const reason = (t: Task) =>
  (t.problem || t.nice_status || 'Globus did not say why').replace(/_/g, ' ').toLowerCase().replace(/^./, (c) => c.toUpperCase())
