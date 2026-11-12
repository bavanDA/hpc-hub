import type { Profile } from './clusters'
import type { Command } from './terminals'

/** One setting an agent understands; choices are [value, label], value "" adds no flag. */
export type AgentOption = { key: string; label: string; choices: [string, string][] }

export type AgentInfo = {
  id: string  // claude, codex, agy, cursor
  name: string
  remote_label: string  // "" = no remote control (Cursor)
  remote_hint: string
  options: AgentOption[]
  settings: { command: string; workdir: string; new_node: boolean; remote: boolean } & Record<string, unknown>
  profile: Profile  // what a node for it asks for
}

export type Target = 'desktop' | 'browser'

export type ToolSetup = {
  id: string
  name: string
  connected: boolean
  node: string
  job: string
  profile: Profile
  vscode: { workdir: string; open_in: Target; open_links: boolean; ask?: boolean; profile: Profile }
  agents: AgentInfo[]
}

export type Chat = { id: string; name: string; cwd: string; title: string; first: string; last: string;
  mtime: number; size: number }

export type Chats = { home: string; chats: Chat[]; cached?: boolean }  // cached: the last list, fresh one coming

/** A started agent or Ask all: the tab's command line. */
export type Started = Command & { title: string; color: string; out?: string }

export type VsJob = { id: string; node: string; name: string; resources: string }

export type VsFound = { job: VsJob | null; tunnel: string }

export type Opened = { app: boolean; url: string; missing: boolean }

export type Follow = { argv: string[]; job: string; title: string; color: string }

export type VsStarted = {
  folder: string
  target: Target
  job: string
  open?: Opened
  follow?: Follow
  submitted?: string
}

/** How far the VS Code job got (hpc_hub/compute/vscode_job.py). */
export type VsPhase = 'queued' | 'starting' | 'login' | 'ready' | 'ended'

export type VsStatus = {
  job: string
  phase: VsPhase
  state: string  // Slurm's: PENDING, RUNNING, TIMEOUT...
  node: string
  reason: string  // why it waits: Priority, Resources...
  start: string  // when Slurm expects it to start, 2026-11-12T15:00:00
  tunnel: string
  url: string
  home: string
  device: { url: string; code: string } | null  // the GitHub sign-in still to do
  installing: boolean  // the VS Code server is downloading on the node
  server: boolean  // and has started
  web: string  // code serve-web's address on the node, if your command runs that
  problem: string
  tail: string[]  // the log's last lines
  follow: Follow
}
