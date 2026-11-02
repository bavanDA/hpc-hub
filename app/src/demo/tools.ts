// Demo data for VS Code, the agents and Ask all: made-up chats, a VS Code job, pretend command lines.
import type { Profile } from '../types/clusters'
import { demoCluster } from './clusters'
import type { AgentInfo, Chat, Chats, Opened, Started, ToolSetup, VsFound, VsStarted } from '../types/tools'

const now = Math.floor(Date.now() / 1000)
const profile: Profile = { cpus: 4, mem_gb: 16, time: '04:00:00', partition: 'general', account: 'mygroup', qos: '',
  gpus: 0 }
const EFFORT: [string, string][] = [['', 'Default'], ['low', 'Low'], ['medium', 'Medium'], ['high', 'High'],
  ['xhigh', 'Extra high'], ['max', 'Max']]

function agent(id: string, name: string, command: string, remote: [string, string],
  options: AgentInfo['options']): AgentInfo {
  return { id, name, remote_label: remote[0], remote_hint: remote[1], options, profile,
    settings: { command, workdir: '~/thesis', new_node: false, remote: false,
      ...Object.fromEntries(options.map((o) => [o.key, ''])) } }
}

const AGENTS: AgentInfo[] = [
  agent('claude', 'Claude', 'claude', ['Remote control', 'Use this session from claude.ai/code or the Claude app'], [
    { key: 'model', label: 'Model',
      choices: [['', 'Default'], ['opus', 'Opus'], ['sonnet', 'Sonnet'], ['haiku', 'Haiku']] },
    { key: 'mode', label: 'Permission mode', choices: [['', 'Default'], ['acceptEdits', 'Accept edits'],
      ['plan', 'Plan only'], ['auto', 'Auto']] },
    { key: 'effort', label: 'Effort', choices: EFFORT }]),
  agent('codex', 'ChatGPT', 'codex', ['ChatGPT remote', 'Use this session from the ChatGPT app, one session at a time'], [
    { key: 'sandbox', label: 'Sandbox', choices: [['', 'Default'], ['read-only', 'Read only'],
      ['workspace-write', 'Write in the folder']] },
    { key: 'effort', label: 'Reasoning effort', choices: EFFORT.slice(0, 5) }]),
  agent('agy', 'Antigravity', 'agy', ['Remote control', 'Use this session from Antigravity on another device'], [
    { key: 'mode', label: 'Mode', choices: [['', 'Default'], ['accept-edits', 'Accept edits'], ['auto', 'Auto']] }]),
  agent('cursor', 'Cursor', 'cursor-agent', ['', ''], [
    { key: 'model', label: 'Model', choices: [['', 'Default'], ['auto', 'Auto']] }]),
]

function setup({ cluster }: { cluster: string }): ToolSetup {
  const wulver = cluster === 'wulver'
  const c = demoCluster(cluster)
  const v = c?.vscode  // the VS Code job as saved in the cluster's settings, like hpc_hub/api/methods/tools.py
  return { id: cluster, name: c?.name ?? cluster, connected: true, node: wulver ? 'n0042' : '',
    job: wulver ? '123456' : '', profile,
    vscode: { workdir: v?.workdir ?? '~', open_in: v?.open_in ?? 'desktop', open_links: v?.open_links ?? true,
      ask: v?.ask ?? true, profile: v ? { ...v.compute } : { ...profile, cpus: 2, mem_gb: 8, time: '08:00:00' } },
    agents: AGENTS }
}

function chat(id: string, name: string, cwd: string, hoursAgo: number, size: number): Chat {
  return { id, name, cwd, title: name, first: name, last: '', mtime: now - hoursAgo * 3600, size }
}

const CHATS: Chat[] = [
  chat('a1b2c3d4-0001', 'Fix the loss plot axis labels', '/home/jdoe/thesis', 1, 1_250_000),
  chat('a1b2c3d4-0002', 'Speed up the data loader', '/home/jdoe/thesis/src', 20, 3_400_000),
  chat('a1b2c3d4-0003', 'Write the methods section draft', '/home/jdoe/thesis/paper', 50, 820_000),
  chat('a1b2c3d4-0004', 'Why does sbatch reject my job', '/home/jdoe', 200, 96_000),
  chat('a1b2c3d4-0005', 'Port train.py to the new cluster', '/project/mygroup/abc123', 900, 2_100_000),
]

function chats({ folder = '' }: { folder?: string }): Chats {
  const top = folder.replace(/^~/, '/home/jdoe').replace(/\/+$/, '')
  return { home: '/home/jdoe', chats: top ? CHATS.filter((c) => c.cwd === top || c.cwd.startsWith(top + '/')) : CHATS }
}

function started(name: string, title: string, color: string, out?: string): Started {
  return { argv: ['ssh', '-tt', 'jdoe@wulver'], name, node: 'n0042', title, color, out }
}

function vscodeStart({ folder, target, job, replace_job }:
  { folder: string; target: 'desktop' | 'browser'; job?: string; replace_job?: boolean }): VsStarted {
  const where = folder.replace(/^~/, '/home/jdoe')
  const id = job && !replace_job ? job : '123999'
  return { folder: where, target, submitted: id === job ? undefined : id,
    follow: { argv: ['ssh', '-tt', 'jdoe@wulver'], job: id, title: `VS Code · Wulver (NJIT) · job ${id}`,
      color: '#3584e4' } }
}

export const answers: Record<string, unknown> = {
  'tools.setup': setup,
  'tools.chats': chats,
  'tools.chats_cached': () => null,
  'tools.installed': ['claude', 'codex', 'cursor'],
  'tools.vscode_find': ({ cluster }: { cluster: string }): VsFound => cluster === 'wulver'
    ? { job: { id: '123500', node: 'n0007', name: 'hpc-hub-vscode', resources: '2 cores · 8G · 1:12:40 of 8:00:00' },
      tunnel: '' }
    : { job: null, tunnel: '' },
  'tools.vscode_start': vscodeStart,
  'tools.vscode_open': ({ tunnel, folder }: { tunnel: string; folder: string }): Opened =>
    ({ app: false, url: `https://vscode.dev/tunnel/${tunnel}${folder}`, missing: false }),
  'tools.forward': 'http://127.0.0.1:50123/',
  'tools.agent_start': ({ agent, folder, label }: { agent: string; folder: string; label?: string }) => {
    const a = AGENTS.find((x) => x.id === agent)!
    const colors: Record<string, string> = { claude: '#d97757', codex: '#10a37f', agy: '#4285f4', cursor: '#8b8b8b' }
    return started(`hpchub-${agent}-123456-${now}`, `${a.name} · ${label || folder.split('/').pop() || folder}`,
      colors[agent])
  },
  'tools.ask_start': ({ prompt, out }: { prompt: string; out: string }) =>
    started(`hpchub-ask-123456-${now}`, `Ask all · ${prompt.split('\n')[0].slice(0, 40)}`, '#9141ac', out),
}
