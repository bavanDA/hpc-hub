export type FileStat = { path: string; added: number; removed: number; binary?: boolean }

export type HCommit = {
  hash: string
  short: string
  author: string
  email: string
  time: number  // unix seconds
  parents: string[]
  tags: string[]
  branches: string[]
  subject: string
  body: string
  files: FileStat[]
  added: number
  removed: number
}

export type SavedSetting = 'off' | 'cluster' | 'backup'

export type Change = { path: string; added: number; removed: number; new: boolean }

export type GitState = {
  root: string  // "" when the folder is not a repository
  git_dir: string
  prefix: string  // the project folder, from the top ("" or "paper/")
  branch: string
  head: string
  upstream: string
  ahead: number
  behind: number
  fetched: number
  user: string
  email: string
  login: string
  changes: Change[]
  saved: SavedSetting
  saved_at: number
  syncing: boolean
  remotes: string[]
}

/** One line of a diff. m: changed words as [from, to) in t. mv: the move it belongs to; same: moved unchanged;
 *  src: a removed line shown inside the block it moved to. */
export type Row = { k: ' ' | '-' | '+'; o: number | null; n: number | null; t: string; m: [number, number][]
  mv?: number; same?: boolean; src?: boolean }
export type Hunk = { old: number; new: number; header: string; rows: Row[] }
export type FileDiff = { path: string; old_path: string; status: 'A' | 'M' | 'D' | 'R'; binary: boolean
  added: number; removed: number; hunks: Hunk[] }
export type Place = { path: string; line: number; end: number }
export type Move = { id: number; lines: number; changes: number; from: Place; to: Place }
export type Changes = { from: string; to: string; files: FileDiff[]; moves: Move[]; truncated: boolean
  added: number; removed: number }

export type BlameCommit = { hash: string; author: string; time: number; summary: string; path: string
  previous: { hash: string; path: string } | null; uncommitted: boolean }
export type Blame = { commits: Record<string, BlameCommit>; lines: [string, number][] }

export type LineStory = { uncommitted: true; line: number } | {
  uncommitted: false
  commit: Omit<HCommit, 'files'>
  path: string
  line: number
  rows: Row[]
  more: number
  older: { rev: string; path: string; line: number; hash: string; subject: string; author: string; time: number }
    | null
}

export type Branch = { name: string; hash: string; time: number; author: string; subject: string; upstream: string
  current: boolean; new: number }
export type RemoteBranch = { name: string; local: string; hash: string; time: number; author: string
  subject: string }
export type Tag = { name: string; hash: string; time: number; author: string; subject: string }
export type Refs = { current: string; branches: Branch[]; remote: RemoteBranch[]; remote_only: RemoteBranch[]
  tags: Tag[]; last_pull: { hash: string; time: number } | null
  mine: { hash: string; time: number; subject: string } | null }

export type Lanes = { base: string; a: string; b: string; only_a: HCommit[]; only_b: HCommit[] }

export type SwitchCheck = { from: string; target: string; remote_only: boolean; files: number; changes: Change[]
  clash: { path: string; line: number }[]; bring: boolean }

export type Step = { label: string; seconds: number; done: boolean }
export type GitJob = { id: string; cluster: string; folder: string; kind: 'switch' | 'push' | 'pull'
  steps: Step[]; done: boolean; ok?: boolean; error?: string; result?: unknown }

export type SwitchDone = { branch: string; from: string; brought: number; kept: number; back: '' | 'back' | 'kept' }
export type SyncDone = { done: true; push: boolean; branch: string; pulled: number; pulled_by: string
  pushed: number; back: number }

export type Who = { hash: string; subject: string; author: string }
export type Spot = { path: string; index: number; line: number; end: number; mine: string[]; theirs: string[]
  base: string[]; before: string[]; after: string[]; mine_commit: Who | null; theirs_commit: Who | null }
export type SyncState = { push: boolean; stage: 'aside' | 'pull' | 'back'; branch: string; upstream: string
  remote: string; pulled: number; pulled_by: string; pulled_at: number; changes: number; pushed: number
  spots: Spot[] }
export type Pick = { take: 'mine' | 'theirs' | 'both' | 'edit'; text?: string }

export type SavedVersion = { hash: string; time: number; kind: string; files: string[]; previous: string
  base: string }

export type PdfJob = { id: string; cluster: string; folder: string; ok: boolean; path: string; error: string
  seconds: number }

export type SyncSpot = { line: number; page: number; x: number; y: number } | null

export type AgentDesc = { id: string; name: string; models: [string, string][]; efforts: [string, string][] }
export type AgentPick = { agent: string; model: string; effort: string }
/** The agent is picked in Settings; the paper picks its model and effort, any of each. */
export type AgentChoice = AgentPick & { split: boolean; label: string; agents: AgentDesc[] }
/** For one question: another model and effort of the same agent. */
export type AgentLevel = { model: string; effort: string }
export type AgentStarted = { id: string; node: string; label: string; agent: string }
export type AgentKind = 'write' | 'ask' | 'check'
export type AgentEvent = { id: string; cluster: string; folder: string; kind: AgentKind; node: string; label: string
  done: boolean; seconds: number; stage?: 'preparing' | 'running'; ok?: boolean; error?: string; cancelled?: boolean
  result?: unknown; about?: { files?: number; lines?: number; notes?: number; title?: string } }

export type Suggested = { subject: string; body: string; files: string[] }
export type Written = { subject: string; body: string; commits: Suggested[]; files: Change[]; head: string }
export type Cite = { ref: string; path: string; line: number; end: number; page: number }
export type Answer = { text: string; cites: Cite[]; question: string }
export type Verdict = { id: string; verdict: 'done' | 'not_yet' | 'unsure'; reason: string; path: string; line: number }
export type Checked = { checked: number; results: Verdict[] }

/** What a question is about. Paths are from the repository's top. */
export type About = { kind: 'commit'; hash: string } | { kind: 'range'; frm: string; to: string } | { kind: 'now' }
  | { kind: 'lines'; path: string; line: number; end: number; at?: string; text?: string; diff?: string }
  | { kind: 'pdf'; page: number; path?: string; line?: number; end?: number; text?: string }

/** A line {path, line}, a spot on the PDF {page, x, y} (points from the page's top) or a commit {hash}. */
export type NotePlace = { path: string; line: number } | { page: number; x: number; y: number } | { hash: string }
export type Note = { id: string; n: number; text: string; place: NotePlace | null; author: string; time: number
  done: boolean; done_by: string; done_at: number }
export type NoteList = { notes: Note[]; user: string; root: string }
