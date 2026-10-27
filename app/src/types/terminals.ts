// What hpc_hub/api/methods/terminals.py sends (see hpc_hub/terminals/tmux.py and links.py).

/** A tmux (or screen) session on a cluster. */
export type TmuxSession = {
  name: string
  kind: 'tmux' | 'screen'
  created: number
  attached: number
  label: string
  color: string  // its own color, or its agent's
  command: string
  windows: number
  path: string
  remote: string  // remote control link, or "code:XXXX-XXXX"
  node: string  // compute node its tmux runs on; "" = the login node
  title: string
  agent: string  // claude, codex, agy, cursor, term, or ""
  job: string
}

export type Listing = {
  host: string
  has_tmux: boolean
  nodes: Record<string, string> | null  // running job id -> node
  sessions: TmuxSession[]
}

/** The local command line that opens a terminal, from terminals.command. */
export type Command = { argv: string[]; name: string; node: string; title?: string; color?: string }

export type NewTerminal = { name: string; node: boolean; folder: string; color: string }

/** One disk of the host, from df: / and /tmp, local ones only. */
export type MonitorDisk = { mount: string; used: number; size: number; percent: number }

/** What the monitoring bar shows, from `monitor` events (hpc_hub/terminals/monitor.py). Sizes in bytes. */
export type MonitorStats = {
  id: number  // from monitor.watch
  host: string
  cpu: number | null  // percent of all cores; null until the second sample
  mem_used: number
  mem_total: number
  up: number | null  // bytes per second; null until the second sample
  down: number | null
  uptime: number  // seconds
  users: number
  disks: MonitorDisk[]
  nets: string[]  // the interfaces counted
}

export type Link = {
  kind: 'tunnel' | 'device-login' | 'local-web' | 'remote' | 'pair'
  url: string
  code: string
  host: string
  port: number
  tunnel?: string
}

// Same as tmux.COLORS and tmux.AGENT_COLORS
export const COLORS = ['#3584e4', '#2ec27e', '#e5a50a', '#ff7800', '#e01b24', '#9141ac', '#986a44', '#77767b']

export const AGENT_NAMES: Record<string, string> = {
  claude: 'Claude', codex: 'ChatGPT', agy: 'Antigravity', cursor: 'Cursor', ask: 'Ask all', term: 'Terminal',
}
