import type { LockConfig, LockStatus } from '../../types/permissions'
import { inRange } from '../e/range'

export const lockConfig = (s: LockStatus): LockConfig => ({ minutes: s.config.minutes ?? 10,
  tries: s.config.tries ?? 3, logout: s.config.logout ?? true, scancel: s.config.scancel ?? true })

/** Whether the typed numbers are allowed, so the page can hold Save. */
export const lockOk = (c: LockConfig) => inRange(c.minutes, 0, 240) && inRange(c.tries, 1, 10)
