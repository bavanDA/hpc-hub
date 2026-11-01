// Shapes of what hpc_hub/api/methods/backup.py sends (hpc_hub/backup/model.py). Sizes are bytes unless the name
// says GB, days are whole days, times are seconds since 1970.

export type FileClass = 'results' | 'code' | 'writing' | 'inputs' | 'logs' | 'regen' | 'checkpoint' | 'unsure'

export type Purge = {
  days: number  // 0: scratch here has no timer
  basis: 'oldest' | 'mtime' | 'atime' | 'created'
  sooner_when_full_pct: number
  warns_by_email: boolean
  source_url: string
  quote: string
  from_cluster: boolean  // days read from the cluster just now (Yale's getquota)
  allocation_end: string
}

export type Destination = {
  path: string  // copies go to <path>/from-scratch
  label: string
  used_gb: number
  quota_gb: number  // 0: not known
  free_gb: number
  files: number
  file_limit: number
  shared_with: number
  backed_up: boolean
}

export type BackupPolicy = {
  scratch: string
  destinations: Destination[]
  purge: Purge
  scratch_fill_pct: number
  files_in_scratch: number
  no_tricks: string
}

export type ScanState = 'starting' | 'waiting_for_node' | 'scanning' | 'thinking' | 'done' | 'failed' | 'cancelled'

export type Scan = {
  id: string
  cluster: string
  scratch: string
  horizon: number
  group: boolean
  agent: string  // '' = rules only
  scheduled?: boolean  // made by the weekly check
  state: ScanState
  detail: string
  progress: { checked?: number; expected?: number; done?: boolean }
  partial: boolean  // the walk ran out of time: numbers are a floor
}

export type ClassCount = { files: number; bytes: number; at_risk_files: number; at_risk_bytes: number }

export type Folder = {
  path: string  // relative to scratch
  bytes: number
  apparent_bytes: number
  files: number
  at_risk_files: number
  at_risk_bytes: number
  soonest_days: number | null
  kind: FileClass
  by_class: Partial<Record<FileClass, ClassCount>>
  git: boolean
  busy: boolean  // a running job works here
  links_out: number
  sparse: number
  hardlinks: number
  biggest: [string, number, FileClass, number | null][]  // path, bytes, class, days left
}

export type Summary = {
  id: string
  scratch: string
  started: number
  horizon_days: number
  purge: Purge
  files: number
  bytes: number
  at_risk_files: number
  at_risk_bytes: number
  soonest_days: number | null  // 0 or less: any day now
  hardlinks: number
  guessed_dates: number
  partial: boolean
  scratch_fill_pct: number
  deadlines: { days: number; files: number; bytes: number }[]
  folders: Folder[]
  destinations: Destination[]
}

export type PlanItem = {
  folder: string
  kind: FileClass
  keep: boolean
  files: number
  bytes: number
  why: string
  by: 'rule' | 'agent' | 'you'
}

export type Space = {
  dest: string
  before_gb: number
  after_gb: number
  quota_gb: number
  pct_after: number
  files_after: number
  file_limit: number
  fits: boolean
  warn: string  // '' = nothing to say
}

export type Rule = { folder: string; class?: FileClass; glob?: string; keep: boolean; except_newest: number; to: string }

export type Plan = {
  scan_id: string
  dest: string
  horizon_days: number
  scope: 'at_risk' | 'everything'
  items: PlanItem[]
  left_out: PlanItem[]
  files: number
  bytes: number
  exact: boolean  // true after the trial run
  space: Space
  agent_summary: string
  rules: Rule[]
  hash: string  // backup.start's confirm
  will_replace?: number
  busy?: string[]
}

/** One change from you: a folder (no class) or one kind of file in it. */
export type Choice = { path: string; class?: FileClass; keep: boolean }

export type CopyState = 'filtering' | 'trying' | 'tried' | 'copying' | 'verifying' | 'resubmitted' | 'done' | 'failed'
  | 'cancelled'

export type Progress = {
  state: CopyState
  done_bytes: number
  total_bytes: number
  files_done: number
  files_total: number
  eta_s: number
  resubmits: number
  detail: string
}

export type CopyResult = {
  copied_files: number
  bytes: number
  verified: 'checksum' | 'quick' | ''
  mismatches: number
  busy: string[]  // changed in the last 30 minutes, left for the next copy
  failed: { path: string; why: string }[]
  notes_path: string
}

export type Reminders = { enabled: boolean; days: number[]; time: string; horizon_days: number; next?: string }

export type BackupAlert = {
  cluster: string
  kind: 'at_risk'
  files: number
  bytes: number
  soonest_days: number
  top_folder: string
  title: string
  text: string
}
