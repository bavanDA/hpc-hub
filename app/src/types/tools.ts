// What hpc_hub/api/methods/tools.py sends (see hpc_hub/agents/catalog.py, chats.py and core/config.py).
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
  vscode: { workdir: string; open_in: Target; open_links: boolean; profile: Profile }
  agents: AgentInfo[]
}

export type Chat = { id: string; name: string; cwd: string; title: string; first: string; last: string;
  mtime: number; size: number }

export type Chats = { home: string; chats: Chat[] }

/** A started agent or Ask all: the tab's command line. */
export type Started = Command & { title: string; color: string; out?: string }

export type VsJob = { id: string; node: string; name: string; resources: string }

export type VsFound = { job: VsJob | null; tunnel: string }

export type Opened = { app: boolean; url: string; missing: boolean }

export type VsStarted = {
  folder: string
  target: Target
  open?: Opened
  follow?: { argv: string[]; job: string; title: string; color: string }
  submitted?: string
}
