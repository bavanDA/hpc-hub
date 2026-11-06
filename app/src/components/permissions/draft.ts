import type { ClaudePermissions, LockConfig } from '../../types/permissions'
import { lockConfig } from './lock'

export type Draft = { allowed: string[]; custom: string[]; trash: boolean; ask: string[]; accept_edits: boolean
  lock: LockConfig }

export const draftOf = (p: ClaudePermissions): Draft => ({ allowed: [...p.allowed].sort(), custom: p.custom,
  trash: p.trash, ask: [...p.ask].sort(), accept_edits: p.accept_edits, lock: lockConfig(p.lock) })
