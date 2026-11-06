// Demo data for the Terminals page: made-up tmux sessions, and a pretend command line (no PTY in a browser).
import type { Command, Link, Listing, TmuxSession } from '../types/terminals'

const now = Math.floor(Date.now() / 1000)
const THESIS = '/mmfs1/project/mygroup/jdoe/thesis'
let opened = 0

function session(name: string, fields: Partial<TmuxSession>): TmuxSession {
  return { name, kind: 'tmux', created: now - 600, attached: 0, label: '', color: '', command: 'bash', windows: 1,
    path: '/home/jdoe', remote: '', node: '', title: fields.label || name, agent: '', job: '', ...fields }
}

const listings: Record<string, Listing> = {
  wulver: {
    host: 'login01', has_tmux: true, nodes: { 123456: 'n0042' },
    sessions: [
      session('hpchub-claude-123456-0912', { label: 'Claude · thesis', color: '#d97757', agent: 'claude',
        job: '123456', node: 'n0042', command: 'claude', created: now - 2400, attached: 1,
        remote: 'https://claude.ai/code/session_abc123', path: THESIS }),
      session('hpchub-vscode-123456-0900', { label: 'VS Code tunnel', color: '#3584e4', agent: 'vscode',
        job: '123456', node: 'n0042', command: 'code', created: now - 3000 }),
      session('hpchub-term-1024-101500', { label: 'Training run', color: '#2ec27e', agent: 'term',
        command: 'python', created: now - 3 * 3600, path: THESIS }),
      session('hpchub-term-1024-093000', { label: 'Data prep', agent: 'term', node: 'n0042', command: 'bash',
        created: now - 5 * 3600, path: `${THESIS}/src` }),
      session('build', { color: '#e5a50a', created: now - 26 * 3600 }),
      session('4321.notes', { kind: 'screen', label: 'notes', command: '', created: 0 }),
    ],
  },
  yale: { host: 'bouchet1', has_tmux: true, nodes: {}, sessions: [
    session('hpchub-codex-0930', { label: 'ChatGPT · climate-model', agent: 'codex', command: 'codex',
      created: now - 1800, path: '/home/jdoe/project/climate-model' }),
  ] },
}

function scan({ text }: { text: string }): Link[] {
  const out: Link[] = []
  const tunnel = text.match(/https:\/\/vscode\.dev\/tunnel\/(\w+)\S*/)
  if (tunnel) out.push({ kind: 'tunnel', url: tunnel[0], code: '', host: '', port: 0, tunnel: tunnel[1] })
  const device = text.match(/https:\/\/github\.com\/login\/device/)
  const code = text.match(/\b[A-Z0-9]{4}-[A-Z0-9]{4}\b/)
  if (device) out.push({ kind: 'device-login', url: device[0], code: code?.[0] ?? '', host: '', port: 0 })
  return out
}

function command({ session: name, node = '', new: spec }:
  { session?: string; node?: string; new?: { name: string; color: string; node: boolean } }): Command {
  if (name) return { argv: ['ssh', '-tt', 'jdoe@wulver', `tmux attach -t ${name}`], name, node }
  const fresh = `hpchub-term-demo-${now}-${++opened}`
  return { argv: ['ssh', '-tt', 'jdoe@wulver'], name: fresh, node: spec?.node ? 'n0042' : '', title: spec?.name,
    color: spec?.color }
}

export const answers: Record<string, unknown> = {
  'terminals.list': ({ cluster }: { cluster: string }) => {
    if (!listings[cluster]) throw new Error('Connect first')
    return listings[cluster]
  },
  'terminals.command': command,
  'terminals.links': scan,
  'terminals.buffer': '',
  'terminals.rename': null, 'terminals.stop': null,
}
