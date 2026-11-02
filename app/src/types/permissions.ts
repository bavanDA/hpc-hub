// Shapes of what hpc_hub/api/methods/permissions.py sends.
export type CommandGroup = { title: string; note: string; commands: string[] }

export type LockConfig = { minutes: number; tries: number; logout: boolean; scancel: boolean }

export type LockStatus = {
  set_up: boolean
  locked: boolean  // too many wrong codes
  config: Partial<LockConfig>
  open: number  // sessions open now
  log: string[]  // newest first
}

export type ClaudePermissions = {
  name: string
  allowed: string[]
  custom: string[]  // allowed commands that are in no group
  trash: boolean
  ask: string[]
  accept_edits: boolean
  groups: CommandGroup[]
  asks: { key: string; label: string; hint?: string }[]
  lock: LockStatus
}

export type LockSetup = { id: string; key: string; qr: string }
